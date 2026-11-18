import { randomUUID } from 'node:crypto';
import {
  buildReaderProgressState,
  canDiscoverStory,
  resolveStoryAccess,
  type Story,
  type StoryAccessCapabilities,
  type StoryAccessSettings,
  type StoryAccessSubject,
  type StoryCommentPolicy,
  type StoryEditPolicy,
  type StoryListFilter,
  type StoryVisibility,
  type UserRole,
} from '@paralleax/shared';
import { Pool } from 'pg';
import type { DatabaseConnection } from '../../database/database.connection';
import { DatabaseMigrator } from '../../database/database.migrator';
import { resetPostgresTestDatabase } from '../../database/postgres-test-database';
import { StoriesRepository } from '../stories.repository';

// Every SQL access predicate in StoriesRepository must agree with the shared
// rules in packages/shared/src/access-control.ts for every combination of
// access settings and acting subject.

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres =
  connectionString !== undefined && connectionString !== '' ? describe : describe.skip;

const visibilities: StoryVisibility[] = [
  'private',
  'authenticated',
  'public',
  'unlisted',
  'invitation',
];
const editPolicies: StoryEditPolicy[] = ['owner', 'collaborators', 'authenticated'];
const commentPolicies: StoryCommentPolicy[] = ['readers', 'editors'];
const listFilters: StoryListFilter[] = ['all', 'editable', 'commentable', 'owned'];

interface AccessParticipant {
  name: string;
  userId: string;
  role: UserRole;
  subject: StoryAccessSubject;
}

const run = randomUUID();
const storyId = `access-story-${run}`;
const storyTitle = `Access parity ${run}`;
const ownerId = `access-owner-${run}`;
const viewerId = `access-viewer-${run}`;
const editorId = `access-editor-${run}`;
const participants: AccessParticipant[] = [
  participant('owner', ownerId, 'user', { isOwner: true }),
  participant('admin', `access-admin-${run}`, 'admin'),
  participant('stranger', `access-stranger-${run}`, 'user'),
  participant('viewer', viewerId, 'user', { collaboratorRole: 'viewer' }),
  participant('editor', editorId, 'user', { collaboratorRole: 'editor' }),
];
const settingsMatrix = visibilities.flatMap((visibility) =>
  editPolicies.flatMap((editPolicy) =>
    commentPolicies.map((commentPolicy) => ({ visibility, editPolicy, commentPolicy })),
  ),
);

const pool = new Pool({ connectionString });
const database: DatabaseConnection = {
  pool,
  async onModuleDestroy() {
    await pool.end();
  },
};
const repository = new StoriesRepository(database);
const story = accessStory();

describePostgres('story access SQL parity with shared access rules', () => {
  beforeAll(async () => {
    await resetPostgresTestDatabase(pool, new DatabaseMigrator(database));
    await insertParticipants();
    await repository.save(story, ownerId);
    await repository.setCollaborator(storyId, ownerId, email(viewerId), 'viewer');
    await repository.setCollaborator(storyId, ownerId, email(editorId), 'editor');
  }, 30_000);
  afterAll(async () => pool.end());

  it.each(settingsMatrix.map((settings) => [describeSettings(settings), settings] as const))(
    'matches the shared rules for %s',
    async (_label, settings) => {
      await expect(repository.updateAccess(storyId, ownerId, settings)).resolves.toBe(true);
      await expect(anonymousAccess()).resolves.toEqual(expectedAnonymousAccess(settings));
      for (const entry of participants) {
        await expect(observedAccess(entry)).resolves.toEqual(expectedAccess(settings, entry));
      }
    },
  );
});

function participant(
  name: string,
  userId: string,
  role: UserRole,
  subject: Partial<StoryAccessSubject> = {},
): AccessParticipant {
  return { name, userId, role, subject: { authenticated: true, role, ...subject } };
}

function email(userId: string) {
  return `${userId}@example.test`;
}

function describeSettings(settings: StoryAccessSettings) {
  return `visibility=${settings.visibility} edit=${settings.editPolicy} comment=${settings.commentPolicy}`;
}

function accessStory(): Story {
  const now = new Date().toISOString();
  return {
    id: storyId,
    title: storyTitle,
    createdAt: now,
    updatedAt: now,
    interactions: [
      {
        id: 'interaction-1',
        title: 'Arrival',
        body: 'The harbor is quiet.',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}

async function insertParticipants() {
  for (const entry of participants) {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, created_at)
       VALUES ($1, $2, 'test-only', $3, now())`,
      [entry.userId, email(entry.userId), entry.role],
    );
  }
}

async function anonymousAccess() {
  const found = await repository.find(storyId);
  const publicList = await repository.listPublic({ page: 1, pageSize: 5, query: storyTitle });
  return {
    capabilities: found?.capabilities,
    publiclyListed: publicList.items.some((item) => item.id === storyId),
  };
}

function expectedAnonymousAccess(settings: StoryAccessSettings) {
  const subject: StoryAccessSubject = { authenticated: false };
  const expected = resolveStoryAccess(settings, subject);
  return {
    capabilities: expected.canRead ? expected : undefined,
    publiclyListed: canDiscoverStory(settings, subject),
  };
}

async function observedAccess(entry: AccessParticipant) {
  const found = await repository.find(storyId, entry.userId);
  return {
    participant: entry.name,
    capabilities: found?.capabilities,
    editorBootstrap: (await repository.findEditorBootstrap(storyId, entry.userId)) !== undefined,
    readerProgress: await readerProgressAccess(entry.userId),
    canMutate: (await repository.mutate(storyId, (current) => current, entry.userId)) !== undefined,
    canReadAccessSettings: (await repository.getAccess(storyId, entry.userId)) !== undefined,
    listedBy: await listedFilters(entry.userId),
  };
}

function expectedAccess(settings: StoryAccessSettings, entry: AccessParticipant) {
  const expected = resolveStoryAccess(settings, entry.subject);
  const discoverable = canDiscoverStory(settings, entry.subject);
  return {
    participant: entry.name,
    capabilities: expected.canRead ? expected : undefined,
    editorBootstrap: expected.canRead,
    readerProgress: { saved: expected.canRead, found: expected.canRead, slots: expected.canRead },
    canMutate: expected.canEdit,
    canReadAccessSettings: expected.canManage,
    listedBy: listFilters.filter(
      (filter) => discoverable && matchesListFilter(filter, expected, entry.subject),
    ),
  };
}

function matchesListFilter(
  filter: StoryListFilter,
  expected: StoryAccessCapabilities,
  subject: StoryAccessSubject,
) {
  switch (filter) {
    case 'all':
      return true;
    case 'editable':
      return expected.canEdit;
    case 'commentable':
      return expected.canComment;
    case 'owned':
      return subject.isOwner === true;
  }
}

async function readerProgressAccess(userId: string) {
  const state = buildReaderProgressState(story, ['interaction-1']);
  const saved = await repository.saveProgress(storyId, userId, state, new Date().toISOString());
  const found = (await repository.findProgress(storyId, userId)) !== undefined;
  const slots = (await repository.findProgressSaves(storyId, userId)).length > 0;
  await repository.deleteProgress(storyId, userId);
  return { saved, found, slots };
}

async function listedFilters(userId: string) {
  const listed: StoryListFilter[] = [];
  for (const filter of listFilters) {
    const page = await repository.list(userId, { page: 1, pageSize: 5, query: storyTitle, filter });
    if (page.items.some((item) => item.id === storyId)) {
      listed.push(filter);
    }
  }
  return listed;
}
