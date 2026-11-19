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
import {
  parseResponse,
  responseObjectArrayAt,
  responseObjectAt,
  responseStringAt,
  type ApiJsonObject,
} from './test/api-json';
import {
  apiRequests,
  startStoriesApi,
  storiesApiTestUsers,
  type ApiHttpServer,
  type StoriesApi,
} from './test/stories-api';

// Undo and redo of Locations, Characters and Item definitions against the real
// repository: history must match the Story as PostgreSQL reads it back, which
// omits empty optional values such as an empty image URL or a false flag.

// Every test in this file needs the dedicated PostgreSQL test database; hooks
// only run when a test runs, so the file is skipped when it is not configured.
// This local `it` shadows the Jest global on purpose: one switch for the file.
const it = itWithPostgres;
const pool = new Pool({ connectionString: postgresTestDatabaseUrl });
const database = sharedPostgresTestConnection(pool);
let api: StoriesApi;
let httpServer: ApiHttpServer;
const { postApi, patchApi } = apiRequests(() => httpServer);

beforeAll(() => resetPostgresTestDatabase(pool, new DatabaseMigrator(database)), 30_000);
beforeEach(async () => {
  await truncatePostgresTestTables(pool);
  await insertPostgresTestUsers(pool, storiesApiTestUsers);
  api = await startStoriesApi({ database });
  ({ httpServer } = api);
});
afterEach(() => api.close());
afterAll(() => pool.end());

async function createStoryId(): Promise<string> {
  return responseStringAt(parseResponse(await postApi('/api/stories', { title: 'Context' })), 'id');
}

async function revertHistory(storyId: string, action: 'undo' | 'redo'): Promise<ApiJsonObject> {
  const response = await request(httpServer)
    .post(`/api/stories/${storyId}/history/${action}`)
    .expect(201);
  return responseObjectAt(parseResponse(response), 'story');
}

const creations = [
  { name: 'a Location', path: 'locations', field: 'locations', body: { name: 'Harbor' } },
  { name: 'a Character', path: 'characters', field: 'characters', body: { name: 'Ann' } },
  {
    name: 'a playable Character',
    path: 'characters',
    field: 'characters',
    body: { name: 'Bo', isPlayable: true },
  },
  {
    name: 'an Item definition',
    path: 'item-definitions',
    field: 'itemDefinitions',
    body: { name: 'Key' },
  },
] as const;

for (const creation of creations) {
  it(`undoes and redoes the creation of ${creation.name}`, async () => {
    const storyId = await createStoryId();
    await postApi(`/api/stories/${storyId}/${creation.path}`, creation.body, 201);

    expect(responseObjectArrayAt(await revertHistory(storyId, 'undo'), creation.field)).toEqual([]);
    expect(responseObjectArrayAt(await revertHistory(storyId, 'redo'), creation.field)).toEqual([
      expect.objectContaining({ name: creation.body.name }),
    ]);
  });
}

it('undoes and redoes clearing a Location image', async () => {
  const storyId = await createStoryId();
  const created = await postApi(`/api/stories/${storyId}/locations`, { name: 'Harbor' }, 201);
  const path = `/api/stories/${storyId}/locations/${responseStringAt(parseResponse(created), 'location', 'id')}`;
  const imageUrl = 'https://images.example/harbor.png';
  await patchApi(path, { imageUrl }, 200);
  await patchApi(path, { imageUrl: '' }, 200);

  const undone = await revertHistory(storyId, 'undo');
  expect(responseObjectAt(undone, 'locations', 0)).toHaveProperty('imageUrl', imageUrl);
  const redone = await revertHistory(storyId, 'redo');
  expect(responseObjectAt(redone, 'locations', 0)).not.toHaveProperty('imageUrl');
});

it('undoes and redoes making a Character non-playable', async () => {
  const storyId = await createStoryId();
  const created = await postApi(
    `/api/stories/${storyId}/characters`,
    { name: 'Ann', isPlayable: true },
    201,
  );
  const characterId = responseStringAt(parseResponse(created), 'character', 'id');
  await patchApi(`/api/stories/${storyId}/characters/${characterId}`, { isPlayable: false }, 200);

  const undone = await revertHistory(storyId, 'undo');
  expect(responseObjectAt(undone, 'characters', 0)).toHaveProperty('isPlayable', true);
  const redone = await revertHistory(storyId, 'redo');
  expect(responseObjectAt(redone, 'characters', 0)).not.toHaveProperty('isPlayable');
});

it('undoes and redoes a Location creation recorded in the legacy format', async () => {
  const storyId = await createStoryId();
  await postApi(`/api/stories/${storyId}/locations`, { name: 'Harbor' }, 201);
  // Events recorded before history used the read-back Story stored the values
  // the mutation set, which the projection omits; such events remain in production.
  await pool.query(
    `UPDATE story_change_events
        SET changes = jsonb_set(
          changes,
          ARRAY['fields', 'locations', 'entries', entry.key, 'delta', 'after'],
          (entry.value -> 'delta' -> 'after') || '{"imageUrl": ""}'::jsonb
        )
       FROM (
         SELECT event.id, entries.key, entries.value
           FROM story_change_events AS event,
                jsonb_each(event.changes -> 'fields' -> 'locations' -> 'entries') AS entries
          WHERE event.story_id = $1
       ) AS entry
      WHERE story_change_events.id = entry.id`,
    [storyId],
  );

  expect(responseObjectArrayAt(await revertHistory(storyId, 'undo'), 'locations')).toEqual([]);
  expect(responseObjectArrayAt(await revertHistory(storyId, 'redo'), 'locations')).toEqual([
    expect.objectContaining({ name: 'Harbor' }),
  ]);
});
