import 'reflect-metadata';
import { Pool } from 'pg';
import * as request from 'supertest';
import { DatabaseMigrator } from '../database/database.migrator';
import {
  insertPostgresTestUsers,
  itWithPostgres,
  postgresTestDatabaseUrl,
  resetPostgresTestDatabase,
  sharedPostgresTestConnection,
  truncatePostgresTestTables,
} from '../database/postgres-test-database';
import { randomBytes } from 'node:crypto';
import { STORY_CHANGE_PROPOSALS_PER_USER } from './application/story-changes';
import { StoryEventsService } from './story.events';
import {
  parseResponse,
  responseNumberAt,
  responseObjectArrayAt,
  responseStringAt,
  type ApiJsonObject,
} from './test/api-json';
import {
  startStoriesApi,
  storiesApiTestUsers,
  type ApiHttpServer,
  type StoriesApi,
} from './test/stories-api';

// Change batches (ADR-050) against the real API and PostgreSQL. Every test needs
// the dedicated test database; this local `it` skips the file without it.
const it = itWithPostgres;
const pool = new Pool({ connectionString: postgresTestDatabaseUrl });
const database = sharedPostgresTestConnection(pool);
let api: StoriesApi;
let httpServer: ApiHttpServer;

const owner = 'paralleax_session=user-one';
const other = 'paralleax_session=user-two';

beforeAll(() => resetPostgresTestDatabase(pool, new DatabaseMigrator(database)), 30_000);
beforeEach(async () => {
  await truncatePostgresTestTables(pool);
  await insertPostgresTestUsers(pool, storiesApiTestUsers);
  api = await startStoriesApi({ database });
  ({ httpServer } = api);
});
afterEach(() => api.close());
afterAll(() => pool.end());

function post(path: string, body: object, cookie = owner) {
  return request(httpServer).post(path).set('Cookie', cookie).send(body);
}

async function createStory(): Promise<{ storyId: string; startId: string }> {
  const created = parseResponse(await post('/api/stories', { title: 'Batches' }).expect(201));
  const storyId = responseStringAt(created, 'id');
  const start = parseResponse(await post(`/api/stories/${storyId}/interactions`, {}).expect(201));
  const startId = responseStringAt(start, 'interaction', 'id');
  await request(httpServer)
    .patch(`/api/stories/${storyId}/interactions/${startId}`)
    .set('Cookie', owner)
    .send({ title: 'Start' })
    .expect(200);
  return { storyId, startId };
}

/** A scene with three branches; two of them carry conditions. */
function sceneBatch(startId: string): Record<string, unknown>[] {
  return [
    {
      type: 'create_interaction',
      ref: 'scene',
      inputInteractions: [startId],
      fields: { title: 'The encrypted message', body: '<p>A signal arrives.</p>' },
    },
    {
      type: 'create_interaction',
      ref: 'decode',
      inputInteractions: [{ ref: 'scene' }],
      fields: { title: 'Decode it' },
      defaultTrigger: { ref: 'decodeChoice' },
    },
    {
      type: 'create_interaction',
      ref: 'ignore',
      inputInteractions: [{ ref: 'scene' }],
      fields: { title: 'Ignore it' },
      defaultTrigger: {
        conditionGroups: [{ conditions: [{ interactionId: startId, hasBeenVisited: true }] }],
      },
    },
    {
      type: 'create_interaction',
      ref: 'report',
      inputInteractions: [{ ref: 'scene' }],
      fields: { title: 'Report it' },
    },
    {
      type: 'update_trigger',
      trigger: { ref: 'decodeChoice' },
      fields: {
        conditionGroups: [
          { conditions: [{ interactionId: { ref: 'scene' }, hasBeenVisited: true }] },
        ],
        appearanceProbability: 80,
      },
    },
  ];
}

async function preview(storyId: string, operations: object[], cookie = owner, status = 200) {
  return parseResponse(
    await post(
      `/api/stories/${storyId}/changes/preview`,
      { version: 1, operations },
      cookie,
    ).expect(status),
  );
}

/** A commit names the stored preview; it carries no operations. */
function commitBody(previewed: ApiJsonObject) {
  return { version: 1, proposalId: responseStringAt(previewed, 'proposalId') };
}

async function storedProposalCount(userId = 'user-1'): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT count(*) FROM story_change_proposals WHERE user_id = $1',
    [userId],
  );
  return Number(result.rows[0].count);
}

async function storyState(storyId: string) {
  const story = parseResponse(
    await request(httpServer).get(`/api/stories/${storyId}`).set('Cookie', owner).expect(200),
  );
  const events = await pool.query<{ operation: string; kind: string }>(
    'SELECT operation, kind FROM story_change_events WHERE story_id = $1 ORDER BY id',
    [storyId],
  );
  return {
    revision: responseNumberAt(story, 'revision'),
    interactions: responseObjectArrayAt(story, 'interactions'),
    events: events.rows,
  };
}

function interactionByTitle(interactions: ApiJsonObject[], title: string): ApiJsonObject {
  const found = interactions.find((interaction) => interaction.title === title);
  if (!found) {
    throw new Error(`Missing interaction ${title}`);
  }
  return found;
}

it('previews a scene with three branches without writing anything', async () => {
  const { storyId, startId } = await createStory();
  const before = await storyState(storyId);
  const publish = jest.spyOn(api.app.get(StoryEventsService), 'publish');

  const result = await preview(storyId, sceneBatch(startId));

  expect(result).toMatchObject({
    storyId,
    baseRevision: before.revision,
    valid: true,
    operationCount: 5,
    diagnostics: [],
    summary: {
      counts: {
        interactionsAdded: 4,
        interactionsUpdated: 0,
        triggersAdded: 4,
        triggersUpdated: 0,
        connectionsAdded: 4,
        connectionsRemoved: 0,
      },
    },
  });
  expect(responseStringAt(result, 'proposalId')).toMatch(/^[0-9a-f]{64}$/);
  expect(responseObjectArrayAt(result, 'summary', 'interactions')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ change: 'added', ref: 'scene', title: 'The encrypted message' }),
      expect.objectContaining({ change: 'added', ref: 'decode', title: 'Decode it' }),
    ]),
  );
  expect(responseObjectArrayAt(result, 'summary', 'triggers')).toEqual(
    expect.arrayContaining([expect.objectContaining({ ref: 'decodeChoice', conditionCount: 1 })]),
  );
  expect(await storyState(storyId)).toEqual(before);
  expect(publish).not.toHaveBeenCalled();
  // Only the proposal itself is stored, outside the authored Story.
  expect(await storedProposalCount()).toBe(1);
});

it('reports diagnostics for invalid operations and offers no proposal', async () => {
  const { storyId } = await createStory();
  const result = await preview(storyId, [
    { type: 'create_interaction', ref: 'a', inputInteractions: [{ ref: 'later' }] },
    { type: 'delete_interaction', interaction: 'x' },
    { type: 'update_interaction', interaction: 'x', fields: { title: 7 } },
  ]);

  expect(result.valid).toBe(false);
  expect(result).not.toHaveProperty('proposalId');
  expect(responseObjectArrayAt(result, 'diagnostics')).toEqual([
    expect.objectContaining({ operationIndex: 1, code: 'UNSUPPORTED_OPERATION' }),
  ]);

  const semantic = await preview(storyId, [
    { type: 'create_interaction', ref: 'a', inputInteractions: [{ ref: 'later' }] },
    { type: 'update_interaction', interaction: 'missing', fields: { title: 7 } },
  ]);
  expect(
    responseObjectArrayAt(semantic, 'diagnostics').map(({ operationIndex, code, path }) => [
      operationIndex,
      code,
      path,
    ]),
  ).toEqual([
    [0, 'UNKNOWN_REFERENCE', 'inputInteractions.0'],
    [1, 'INVALID_FIELD', 'fields.title'],
    [1, 'INVALID_FIELD', 'fields.title'],
  ]);

  const rule = await preview(storyId, [
    { type: 'create_interaction', ref: 'a' },
    { type: 'update_interaction', interaction: 'missing-interaction', fields: { title: 'x' } },
  ]);
  expect(responseObjectArrayAt(rule, 'diagnostics')).toEqual([
    expect.objectContaining({ operationIndex: 1, code: 'REFERENCE_NOT_FOUND' }),
  ]);
});

it('commits a batch as one revision and one history event', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations);
  const before = await storyState(storyId);
  const publish = jest.spyOn(api.app.get(StoryEventsService), 'publish');

  const committed = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(200),
  );

  expect(committed).toMatchObject({
    status: 'committed',
    storyId,
    baseRevision: before.revision,
    revision: before.revision + 1,
  });
  const created = responseObjectArrayAt(committed, 'createdEntities');
  expect(created.map(({ ref }) => ref).filter(Boolean)).toEqual([
    'scene',
    'decode',
    'decodeChoice',
    'ignore',
    'report',
  ]);
  const after = await storyState(storyId);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.events.slice(before.events.length)).toEqual([
    { operation: 'story.changes.committed', kind: 'change' },
  ]);
  const scene = interactionByTitle(after.interactions, 'The encrypted message');
  expect(created).toContainEqual(expect.objectContaining({ ref: 'scene', id: scene.id }));
  const decode = interactionByTitle(after.interactions, 'Decode it');
  expect(decode.triggers).toEqual([
    expect.objectContaining({
      inputInteractionIds: [scene.id],
      appearanceProbability: 80,
      conditionGroups: [
        expect.objectContaining({
          conditions: [{ interactionId: scene.id, hasBeenVisited: true }],
        }),
      ],
    }),
  ]);
  expect(publish.mock.calls.map(([event]) => event)).toEqual([
    expect.objectContaining({ storyId, change: 'updated', revision: before.revision + 1 }),
  ]);
});

it('undoes and redoes a committed batch as one change', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const before = await storyState(storyId);
  const previewed = await preview(storyId, operations);
  await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(200);
  const after = await storyState(storyId);
  const decode = interactionByTitle(after.interactions, 'Decode it');

  await post(`/api/stories/${storyId}/history/undo`, {}).expect(201);
  const undone = await storyState(storyId);
  expect(undone.interactions).toHaveLength(before.interactions.length);

  await post(`/api/stories/${storyId}/history/redo`, {}).expect(201);
  const redone = await storyState(storyId);
  expect(interactionByTitle(redone.interactions, 'Decode it')).toEqual(decode);
  expect(redone.interactions).toHaveLength(after.interactions.length);
});

it('keeps a modified Story editable, playable and exportable', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations);
  await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(200);
  const { interactions } = await storyState(storyId);
  const scene = interactionByTitle(interactions, 'The encrypted message');

  await request(httpServer)
    .patch(`/api/stories/${storyId}/interactions/${String(scene.id)}`)
    .set('Cookie', owner)
    .send({ title: 'Edited after the batch' })
    .expect(200);
  const slice = parseResponse(
    await post(`/api/stories/${storyId}/runtime/slice`, {
      currentInteractionId: scene.id,
      interactionIds: [startId, scene.id],
      includeOptions: true,
    }).expect(200),
  );
  expect(JSON.stringify(slice)).toContain('Decode it');
  const exported = await request(httpServer)
    .get(`/api/stories/${storyId}/export`)
    .set('Cookie', owner)
    .expect(200);
  expect(exported.text).toContain('Report it');
});

it('rejects a whole stored batch whose operation breaks a rule at commit', async () => {
  const { storyId, startId } = await createStory();
  const before = await storyState(storyId);
  // Not reachable through a preview: a stored batch whose second operation fails,
  // to show that the commit transaction leaves no partial change.
  const proposalId = randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO story_change_proposals
       (id, story_id, user_id, base_revision, operations, created_at, expires_at)
     VALUES ($1, $2, 'user-1', $3, $4::jsonb, now(), now() + interval '1 hour')`,
    [
      proposalId,
      storyId,
      before.revision,
      JSON.stringify([
        { type: 'create_interaction', ref: 'scene', inputInteractions: [startId] },
        { type: 'update_interaction', interaction: 'not-in-story', fields: { title: 'x' } },
      ]),
    ],
  );

  const rejected = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, { version: 1, proposalId }).expect(400),
  );

  expect(rejected.code).toBe('STORY_CHANGES_INVALID');
  expect(await storyState(storyId)).toEqual(before);
});

it('refuses a commit when the Story changed after the preview', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations);
  await request(httpServer)
    .patch(`/api/stories/${storyId}/interactions/${startId}`)
    .set('Cookie', owner)
    .send({ title: 'Changed meanwhile' })
    .expect(200);
  const before = await storyState(storyId);

  const conflict = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(409),
  );

  expect(conflict).toMatchObject({
    code: 'STORY_REVISION_CONFLICT',
    details: { expectedRevision: before.revision - 1, currentRevision: before.revision },
  });
  expect(await storyState(storyId)).toEqual(before);
  await preview(storyId, [], owner, 400);
  const stale = await post(`/api/stories/${storyId}/changes/preview`, {
    version: 1,
    baseRevision: before.revision - 1,
    operations,
  }).expect(409);
  expect(parseResponse(stale).code).toBe('STORY_REVISION_CONFLICT');
});

it('lets only one of two concurrent commits on the same revision succeed', async () => {
  const { storyId, startId } = await createStory();
  const first = [
    { type: 'create_interaction', inputInteractions: [startId], fields: { title: 'A' } },
  ];
  const second = [
    { type: 'create_interaction', inputInteractions: [startId], fields: { title: 'B' } },
  ];
  const [firstPreview, secondPreview] = await Promise.all([
    preview(storyId, first),
    preview(storyId, second),
  ]);

  const statuses = (
    await Promise.all([
      post(`/api/stories/${storyId}/changes/commit`, commitBody(firstPreview)),
      post(`/api/stories/${storyId}/changes/commit`, commitBody(secondPreview)),
    ])
  ).map(({ status }) => status);

  expect(statuses.sort()).toEqual([200, 409]);
  const { interactions } = await storyState(storyId);
  expect(interactions.filter(({ title }) => title === 'A' || title === 'B')).toHaveLength(1);
});

it('commits only server-stored previews, never client-supplied operations', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations);
  const before = await storyState(storyId);

  // The operations come from the stored preview: a commit cannot carry others.
  await post(`/api/stories/${storyId}/changes/commit`, {
    ...commitBody(previewed),
    operations: [{ type: 'create_interaction', fields: { title: 'Injected' } }],
  }).expect(400);
  // A proposal the server never issued, as a client computing an ID would send.
  const forged = await post(`/api/stories/${storyId}/changes/commit`, {
    version: 1,
    proposalId: randomBytes(32).toString('hex'),
  }).expect(404);
  expect(parseResponse(forged).code).toBe('STORY_CHANGE_PROPOSAL_NOT_FOUND');
  // A proposal of this Story cannot be committed on another Story.
  const elsewhere = await createStory();
  await post(`/api/stories/${elsewhere.storyId}/changes/commit`, commitBody(previewed)).expect(404);

  await pool.query(`UPDATE story_change_proposals SET expires_at = created_at + interval '1 ms'`);
  const expired = await post(
    `/api/stories/${storyId}/changes/commit`,
    commitBody(previewed),
  ).expect(404);
  expect(parseResponse(expired).code).toBe('STORY_CHANGE_PROPOSAL_NOT_FOUND');
  expect(await storyState(storyId)).toEqual(before);
});

it('keeps a bounded number of previews per user and removes a committed one', async () => {
  const { storyId, startId } = await createStory();
  const operations = [{ type: 'update_interaction', interaction: startId, fields: { title: 'x' } }];
  let last: ApiJsonObject = {};
  for (let index = 0; index <= STORY_CHANGE_PROPOSALS_PER_USER; index += 1) {
    last = await preview(storyId, operations);
  }
  expect(await storedProposalCount()).toBe(STORY_CHANGE_PROPOSALS_PER_USER);

  await post(`/api/stories/${storyId}/changes/commit`, commitBody(last)).expect(200);
  expect(await storedProposalCount()).toBe(STORY_CHANGE_PROPOSALS_PER_USER - 1);
});

it('answers a retried commit without applying the batch twice', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations);
  const body = commitBody(previewed);
  const first = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, body).expect(200),
  );
  const afterFirst = await storyState(storyId);

  const retry = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, body).expect(200),
  );

  expect(retry).toEqual({
    status: 'already_applied',
    storyId,
    proposalId: body.proposalId,
    baseRevision: previewed.baseRevision,
    revision: first.revision,
    createdEntities: first.createdEntities,
    reverted: false,
  });
  expect(await storyState(storyId)).toEqual(afterFirst);

  await post(`/api/stories/${storyId}/history/undo`, {}).expect(201);
  const afterUndo = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, body).expect(200),
  );
  expect(afterUndo).toMatchObject({ status: 'already_applied', reverted: true });
});

it('refuses readers, users without access and other users’ proposals', async () => {
  const { storyId, startId } = await createStory();
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations);

  const hidden = await post(
    `/api/stories/${storyId}/changes/preview`,
    { version: 1, operations },
    other,
  ).expect(404);
  expect(hidden.text).not.toContain('Start');
  const otherBody = commitBody(previewed);
  const hiddenCommit = await post(
    `/api/stories/${storyId}/changes/commit`,
    otherBody,
    other,
  ).expect(404);
  expect(hiddenCommit.text).not.toContain('Start');

  await request(httpServer)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', owner)
    .send({ visibility: 'authenticated', editPolicy: 'owner', commentPolicy: 'editors' })
    .expect(200);
  await post(`/api/stories/${storyId}/changes/preview`, { version: 1, operations }, other).expect(
    403,
  );
  await post(`/api/stories/${storyId}/changes/commit`, otherBody, other).expect(403);

  await request(httpServer)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', owner)
    .send({ visibility: 'authenticated', editPolicy: 'authenticated', commentPolicy: 'editors' })
    .expect(200);
  const stolen = await post(
    `/api/stories/${storyId}/changes/commit`,
    commitBody(previewed),
    other,
  ).expect(404);
  expect(parseResponse(stolen).code).toBe('STORY_CHANGE_PROPOSAL_NOT_FOUND');
});

it('respects edit access revoked between preview and commit', async () => {
  const { storyId, startId } = await createStory();
  await request(httpServer)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', owner)
    .send({ visibility: 'invitation', editPolicy: 'collaborators', commentPolicy: 'editors' })
    .expect(200);
  await post(`/api/stories/${storyId}/access/collaborators`, {
    email: 'user-two@paralleax.invalid',
    role: 'editor',
  }).expect(201);
  const operations = sceneBatch(startId);
  const previewed = await preview(storyId, operations, other);
  await request(httpServer)
    .delete(`/api/stories/${storyId}/access/collaborators/user-2`)
    .set('Cookie', owner)
    .expect(204);
  const before = await storyState(storyId);

  await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed), other).expect(404);
  expect(await storyState(storyId)).toEqual(before);
});

it('refuses references to another Story', async () => {
  const { storyId } = await createStory();
  const foreign = await createStory();

  const result = await preview(storyId, [
    { type: 'create_interaction', inputInteractions: [foreign.startId] },
  ]);

  expect(result.valid).toBe(false);
  expect(responseObjectArrayAt(result, 'diagnostics')).toEqual([
    expect.objectContaining({ operationIndex: 0, code: 'INVALID_OPERATION' }),
  ]);
});

it('checks quotas on the final Story', async () => {
  const { storyId, startId } = await createStory();
  process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = '3';
  try {
    const result = await preview(storyId, sceneBatch(startId));
    expect(result.valid).toBe(false);
    expect(responseObjectArrayAt(result, 'diagnostics')).toEqual([
      expect.objectContaining({ operationIndex: null, code: 'STORY_QUOTA_EXCEEDED' }),
    ]);
  } finally {
    delete process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
  }
});

it('sanitizes rich text bodies', async () => {
  const { storyId, startId } = await createStory();
  const operations = [
    {
      type: 'create_interaction',
      inputInteractions: [startId],
      fields: {
        title: 'Unsafe',
        body: '<p onclick="steal()">Hi<script>alert(1)</script><a href="javascript:x()">x</a></p>',
      },
    },
  ];
  const previewed = await preview(storyId, operations);
  expect(JSON.stringify(previewed)).not.toMatch(/script|onclick|javascript:/);
  await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(200);

  const body = String(interactionByTitle((await storyState(storyId)).interactions, 'Unsafe').body);
  expect(body).not.toMatch(/script|onclick|javascript:/);
  expect(body).toContain('Hi');
});
