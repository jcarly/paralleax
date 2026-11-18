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
const inviteeId = `access-invitee-${run}`;
const disposableStoryId = `access-disposable-${run}`;
const savedSlotId = 'manual-save';
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
const story = accessStory(storyId, storyTitle, 'interaction-1', 'trigger-1');
const disposableStory = accessStory(
  disposableStoryId,
  `Disposable ${run}`,
  'disposable-interaction-1',
  'disposable-trigger-1',
);

describePostgres('story access SQL parity with shared access rules', () => {
  beforeAll(async () => {
    await resetPostgresTestDatabase(pool, new DatabaseMigrator(database));
    await insertUser(inviteeId, 'user');
    for (const entry of participants) {
      await insertUser(entry.userId, entry.role);
    }
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
        await expect(managementAccess(entry, settings)).resolves.toEqual(
          expectedManagementAccess(settings, entry),
        );
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

function accessStory(id: string, title: string, interactionId: string, triggerId: string): Story {
  const now = new Date().toISOString();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    interactions: [
      {
        id: interactionId,
        title: 'Arrival',
        body: 'The harbor is quiet.',
        position: { x: 80, y: 120 },
        triggers: [{ id: triggerId, inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}

async function insertUser(userId: string, role: UserRole) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, created_at)
     VALUES ($1, $2, 'test-only', $3, now())`,
    [userId, email(userId), role],
  );
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
    readerProgress: {
      found: expected.canRead,
      slots: expected.canRead,
      overwritten: expected.canRead,
      saved: expected.canRead,
    },
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

// Reads and overwrites run against a save written directly beforehand, as if
// it predated a loss of access, so a refused read cannot pass merely because
// a refused write left nothing to read. A fresh slot covers the insert path.
async function readerProgressAccess(userId: string) {
  const state = buildReaderProgressState(story, ['interaction-1']);
  await pool.query(
    `INSERT INTO story_reader_progress
       (user_id, story_id, slot_id, name, state, created_at, updated_at)
     VALUES ($1, $2, $3, 'Before', $4::jsonb, now(), now())`,
    [userId, storyId, savedSlotId, JSON.stringify(state)],
  );
  const found = (await repository.findProgress(storyId, userId, savedSlotId)) !== undefined;
  const slots = (await repository.findProgressSaves(storyId, userId)).length > 0;
  const now = new Date().toISOString();
  await repository.saveProgress(storyId, userId, state, now, savedSlotId, 'After');
  const stored = await pool.query<{ name: string | null }>(
    `SELECT name FROM story_reader_progress
     WHERE story_id = $1 AND user_id = $2 AND slot_id = $3`,
    [storyId, userId, savedSlotId],
  );
  const saved = await repository.saveProgress(storyId, userId, state, now, 'fresh-save', 'Fresh');
  await pool.query('DELETE FROM story_reader_progress WHERE story_id = $1 AND user_id = $2', [
    storyId,
    userId,
  ]);
  return { found, slots, overwritten: stored.rows[0]?.name === 'After', saved };
}

// Each management operation is attempted by every participant. The observed
// database state, not only the returned flag, must change exactly when the
// shared rules grant canManage; the fixture is restored after each attempt.
async function managementAccess(entry: AccessParticipant, settings: StoryAccessSettings) {
  const updatedAccess = await repository.updateAccess(
    storyId,
    entry.userId,
    alternateSettings(settings),
  );
  const changedAccess = (await storedVisibility(storyId)) !== settings.visibility;
  await pool.query('UPDATE stories SET visibility = $2 WHERE id = $1', [
    storyId,
    settings.visibility,
  ]);

  const invited = await repository.setCollaborator(
    storyId,
    entry.userId,
    email(inviteeId),
    'viewer',
  );
  const grantedInvitee = (await collaboratorRole(inviteeId)) === 'viewer';
  const promoted = await repository.setCollaborator(
    storyId,
    entry.userId,
    email(viewerId),
    'editor',
  );
  const promotedViewer = (await collaboratorRole(viewerId)) === 'editor';
  const removed = await repository.removeCollaborator(storyId, entry.userId, viewerId);
  const removedViewer = (await collaboratorRole(viewerId)) === undefined;
  await pool.query('DELETE FROM story_user_permissions WHERE story_id = $1 AND user_id = $2', [
    storyId,
    inviteeId,
  ]);
  await grantCollaborator(storyId, viewerId, 'viewer');

  await prepareDisposableStory(settings);
  const deleted = await repository.delete(disposableStoryId, entry.userId);
  const deletedStory = (await storedVisibility(disposableStoryId)) === undefined;

  return {
    participant: entry.name,
    updateAccess: [updatedAccess, changedAccess],
    inviteCollaborator: [invited, grantedInvitee],
    changeCollaboratorRole: [promoted, promotedViewer],
    removeCollaborator: [removed, removedViewer],
    deleteStory: [deleted, deletedStory],
  };
}

function expectedManagementAccess(settings: StoryAccessSettings, entry: AccessParticipant) {
  const { canManage } = resolveStoryAccess(settings, entry.subject);
  return {
    participant: entry.name,
    updateAccess: [canManage, canManage],
    inviteCollaborator: [canManage, canManage],
    changeCollaboratorRole: [canManage, canManage],
    removeCollaborator: [canManage, canManage],
    deleteStory: [canManage, canManage],
  };
}

function alternateSettings(settings: StoryAccessSettings): StoryAccessSettings {
  return { ...settings, visibility: settings.visibility === 'private' ? 'public' : 'private' };
}

async function storedVisibility(id: string) {
  const result = await pool.query<{ visibility: StoryVisibility }>(
    'SELECT visibility FROM stories WHERE id = $1',
    [id],
  );
  return result.rows.at(0)?.visibility;
}

async function collaboratorRole(userId: string) {
  const result = await pool.query<{ role: string }>(
    'SELECT role FROM story_user_permissions WHERE story_id = $1 AND user_id = $2',
    [storyId, userId],
  );
  return result.rows.at(0)?.role;
}

async function grantCollaborator(id: string, userId: string, role: 'viewer' | 'editor') {
  await pool.query(
    `INSERT INTO story_user_permissions (story_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (story_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [id, userId, role],
  );
}

// The delete target mirrors the main story's settings and collaborators, and
// is recreated whenever an authorized participant deleted it.
async function prepareDisposableStory(settings: StoryAccessSettings) {
  if ((await storedVisibility(disposableStoryId)) === undefined) {
    await repository.save(disposableStory, ownerId);
    await grantCollaborator(disposableStoryId, viewerId, 'viewer');
    await grantCollaborator(disposableStoryId, editorId, 'editor');
  }
  await pool.query(
    `UPDATE stories SET visibility = $2, edit_policy = $3, comment_policy = $4 WHERE id = $1`,
    [disposableStoryId, settings.visibility, settings.editPolicy, settings.commentPolicy],
  );
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
