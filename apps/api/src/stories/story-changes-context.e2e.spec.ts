import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
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

// Characters and locations in change batches (ADR-050), used by interactions and
// conditions, against the real API and PostgreSQL.
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
  const created = parseResponse(await post('/api/stories', { title: 'Context' }).expect(201));
  const storyId = responseStringAt(created, 'id');
  const start = parseResponse(await post(`/api/stories/${storyId}/interactions`, {}).expect(201));
  return { storyId, startId: responseStringAt(start, 'interaction', 'id') };
}

async function preview(storyId: string, operations: object[], cookie = owner) {
  return parseResponse(
    await post(
      `/api/stories/${storyId}/changes/preview`,
      { version: 1, operations },
      cookie,
    ).expect(200),
  );
}

/** A commit names the stored preview; it carries no operations. */
function commitBody(previewed: ApiJsonObject) {
  return { version: 1, proposalId: responseStringAt(previewed, 'proposalId') };
}

async function readStory(storyId: string) {
  return parseResponse(
    await request(httpServer).get(`/api/stories/${storyId}`).set('Cookie', owner).expect(200),
  );
}

async function storyState(storyId: string) {
  const story = await readStory(storyId);
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

/** The reference scenario: a character, a location and a scene that uses both. */
function contextBatch(startId: string): Record<string, unknown>[] {
  return [
    {
      type: 'create_character',
      ref: 'alya',
      fields: { name: 'Alya', description: 'The station engineer.' },
    },
    {
      type: 'create_location',
      ref: 'station',
      fields: { name: 'Station Néréide-7', description: 'A deep-sea research station.' },
    },
    {
      type: 'create_interaction',
      ref: 'lab',
      inputInteractions: [startId],
      fields: {
        title: 'Inspection du laboratoire',
        locationId: { ref: 'station' },
        characterIds: [{ ref: 'alya' }],
      },
    },
    {
      type: 'create_interaction',
      ref: 'debrief',
      inputInteractions: [{ ref: 'lab' }],
      fields: { title: 'Debrief' },
      defaultTrigger: {
        conditionGroups: [
          {
            conditions: [
              { characterId: { ref: 'alya' }, isPresent: true },
              { locationId: { ref: 'station' }, isCurrentLocation: true },
            ],
          },
        ],
      },
    },
    {
      type: 'update_character',
      character: { ref: 'alya' },
      fields: { category: 'Crew', isPlayable: true },
    },
    { type: 'update_location', location: { ref: 'station' }, fields: { category: 'Station' } },
  ];
}

async function committedContext(storyId: string, startId: string) {
  const previewed = await preview(storyId, contextBatch(startId));
  const committed = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(200),
  );
  const state = await storyState(storyId);
  const story = await readStory(storyId);
  return { previewed, committed, state, story };
}

function entityByName(story: ApiJsonObject, list: 'characters' | 'locations', name: string) {
  const found = responseObjectArrayAt(story, list).find((entity) => entity.name === name);
  if (!found) {
    throw new Error(`Missing ${name}`);
  }
  return found;
}

it('previews characters and locations without writing anything', async () => {
  const { storyId, startId } = await createStory();
  const before = await storyState(storyId);
  const publish = jest.spyOn(api.app.get(StoryEventsService), 'publish');

  const result = await preview(storyId, contextBatch(startId));

  expect(result).toMatchObject({ valid: true, diagnostics: [] });
  expect(await storyState(storyId)).toEqual(before);
  expect(publish).not.toHaveBeenCalled();
  const story = await readStory(storyId);
  expect(responseObjectArrayAt(story, 'characters')).toEqual([]);
  expect(responseObjectArrayAt(story, 'locations')).toEqual([]);
});

it('summarizes created entities with provisional IDs and their references', async () => {
  const { storyId, startId } = await createStory();

  const result = await preview(storyId, contextBatch(startId));

  expect(result).toMatchObject({
    summary: {
      provisionalIds: true,
      counts: {
        charactersAdded: 1,
        charactersUpdated: 0,
        locationsAdded: 1,
        locationsUpdated: 0,
        interactionsAdded: 2,
      },
    },
  });
  const created = responseObjectArrayAt(result, 'createdEntities');
  expect(created.map(({ kind, ref }) => `${String(kind)}:${String(ref)}`)).toEqual(
    expect.arrayContaining(['character:alya', 'location:station', 'interaction:lab']),
  );
  const alya = created.find(({ ref }) => ref === 'alya');
  // The final state of a created entity: its updates are applied in the same batch.
  expect(responseObjectArrayAt(result, 'summary', 'characters')).toEqual([
    expect.objectContaining({
      change: 'added',
      id: alya?.id,
      ref: 'alya',
      name: 'Alya',
      fields: expect.arrayContaining([
        expect.objectContaining({ field: 'description', after: 'The station engineer.' }),
        expect.objectContaining({ field: 'category', after: 'Crew' }),
        expect.objectContaining({ field: 'isPlayable', after: true }),
      ]) as unknown,
    }),
  ]);
  expect(responseObjectArrayAt(result, 'summary', 'locations')).toEqual([
    expect.objectContaining({ change: 'added', ref: 'station', name: 'Station Néréide-7' }),
  ]);
});

it('shows which created entities a scene uses, by their reference', async () => {
  const { storyId, startId } = await createStory();

  const result = await preview(storyId, contextBatch(startId));

  const created = responseObjectArrayAt(result, 'createdEntities');
  const alya = created.find(({ ref }) => ref === 'alya');
  const lab = responseObjectArrayAt(result, 'summary', 'interactions').find(
    ({ ref }) => ref === 'lab',
  );
  expect(lab?.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: 'characterIds',
        references: [{ id: alya?.id, ref: 'alya' }],
      }),
      expect.objectContaining({
        field: 'locationId',
        references: [expect.objectContaining({ ref: 'station' })],
      }),
    ]),
  );
});

it('commits characters, locations and their uses as one revision and one history event', async () => {
  const { storyId, startId } = await createStory();
  const before = await storyState(storyId);
  const publish = jest.spyOn(api.app.get(StoryEventsService), 'publish');

  const { committed, state, story } = await committedContext(storyId, startId);

  expect(committed).toMatchObject({ status: 'committed', summary: { provisionalIds: false } });
  expect(state.revision).toBe(before.revision + 1);
  expect(state.events.slice(before.events.length)).toEqual([
    { operation: 'story.changes.committed', kind: 'change' },
  ]);
  expect(publish).toHaveBeenCalledTimes(1);
  const alya = entityByName(story, 'characters', 'Alya');
  const station = entityByName(story, 'locations', 'Station Néréide-7');
  expect(alya).toMatchObject({ category: 'Crew', isPlayable: true });
  expect(station).toMatchObject({ category: 'Station' });
  // The final IDs replace the references in the interactions and conditions.
  const lab = interactionByTitle(state.interactions, 'Inspection du laboratoire');
  expect(lab).toMatchObject({ locationId: station.id, characterIds: [alya.id] });
  expect(interactionByTitle(state.interactions, 'Debrief').triggers).toEqual([
    expect.objectContaining({
      conditionGroups: [
        expect.objectContaining({
          conditions: [
            { characterId: alya.id, isPresent: true },
            { locationId: station.id, isCurrentLocation: true },
          ],
        }),
      ],
    }),
  ]);
  const created = responseObjectArrayAt(committed, 'createdEntities');
  expect(created).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'character', ref: 'alya', id: alya.id }),
      expect.objectContaining({ kind: 'location', ref: 'station', id: station.id }),
    ]),
  );
});

it('keeps the new entities listed, editable, playable and exportable', async () => {
  const { storyId, startId } = await createStory();
  const { story } = await committedContext(storyId, startId);
  const alya = entityByName(story, 'characters', 'Alya');

  const context = parseResponse(
    await request(httpServer)
      .get(`/api/stories/${storyId}/runtime/context`)
      .set('Cookie', owner)
      .expect(200),
  );
  expect(JSON.stringify(context)).toContain('Alya');
  expect(JSON.stringify(context)).toContain('Station Néréide-7');
  // The usual single-entity endpoints edit them.
  await request(httpServer)
    .patch(`/api/stories/${storyId}/characters/${String(alya.id)}`)
    .set('Cookie', owner)
    .send({ description: 'Edited in the editor.' })
    .expect(200);
  const exported = await request(httpServer)
    .get(`/api/stories/${storyId}/export`)
    .set('Cookie', owner)
    .expect(200);
  expect(exported.text).toContain('Edited in the editor.');
  expect(exported.text).toContain('Station Néréide-7');
});

it('restores the entities and their uses when an export is imported', async () => {
  const { storyId, startId } = await createStory();
  await committedContext(storyId, startId);
  const exported = await request(httpServer)
    .get(`/api/stories/${storyId}/export`)
    .set('Cookie', owner)
    .expect(200);

  const imported = parseResponse(
    await request(httpServer)
      .post('/api/stories/imports/native')
      .set('Cookie', owner)
      .set('Content-Type', 'application/octet-stream')
      .send(exported.text)
      .expect(201),
  );
  const copy = await readStory(responseStringAt(imported, 'id'));
  const copiedAlya = entityByName(copy, 'characters', 'Alya');
  const copiedStation = entityByName(copy, 'locations', 'Station Néréide-7');
  expect(copiedAlya).toMatchObject({ description: 'The station engineer.', isPlayable: true });
  const lab = interactionByTitle(
    responseObjectArrayAt(copy, 'interactions'),
    'Inspection du laboratoire',
  );
  expect(lab).toMatchObject({ locationId: copiedStation.id, characterIds: [copiedAlya.id] });
});

it('undoes and redoes a batch of entities and their uses as one change', async () => {
  const { storyId, startId } = await createStory();
  const before = await storyState(storyId);
  const { state: after, story } = await committedContext(storyId, startId);

  await post(`/api/stories/${storyId}/history/undo`, {}).expect(201);
  const undone = await readStory(storyId);
  expect(responseObjectArrayAt(undone, 'characters')).toEqual([]);
  expect(responseObjectArrayAt(undone, 'locations')).toEqual([]);
  expect((await storyState(storyId)).interactions).toHaveLength(before.interactions.length);

  await post(`/api/stories/${storyId}/history/redo`, {}).expect(201);
  const redone = await readStory(storyId);
  expect(responseObjectArrayAt(redone, 'characters')).toEqual(
    responseObjectArrayAt(story, 'characters'),
  );
  expect(responseObjectArrayAt(redone, 'locations')).toEqual(
    responseObjectArrayAt(story, 'locations'),
  );
  expect((await storyState(storyId)).interactions).toHaveLength(after.interactions.length);
});

it('updates existing characters and locations, keeping omitted fields', async () => {
  const { storyId, startId } = await createStory();
  const { story } = await committedContext(storyId, startId);
  const alya = entityByName(story, 'characters', 'Alya');
  const station = entityByName(story, 'locations', 'Station Néréide-7');
  const operations = [
    { type: 'update_character', character: alya.id, fields: { name: 'Alya Voss' } },
    { type: 'update_location', location: station.id, fields: { category: '' } },
    {
      type: 'create_interaction',
      inputInteractions: [startId],
      fields: { title: 'Back to the station', locationId: station.id, characterIds: [alya.id] },
    },
  ];

  const result = await preview(storyId, operations);

  expect(result).toMatchObject({
    valid: true,
    summary: { counts: { charactersUpdated: 1, locationsUpdated: 1 } },
  });
  expect(responseObjectArrayAt(result, 'summary', 'characters')[0]).toMatchObject({
    change: 'updated',
    id: alya.id,
    fields: [{ field: 'name', before: 'Alya', after: 'Alya Voss' }],
  });
  expect(responseObjectArrayAt(result, 'summary', 'locations')[0]).toMatchObject({
    fields: [{ field: 'category', before: 'Station' }],
  });
  await post(`/api/stories/${storyId}/changes/commit`, commitBody(result)).expect(200);
  const updated = await readStory(storyId);
  expect(entityByName(updated, 'characters', 'Alya Voss')).toMatchObject({
    description: 'The station engineer.',
    category: 'Crew',
    isPlayable: true,
  });
  expect(entityByName(updated, 'locations', 'Station Néréide-7')).not.toHaveProperty('category');
});

it('reports unknown, future, wrong-kind and foreign entity references', async () => {
  const { storyId } = await createStory();
  const diagnostics = async (operations: object[]) =>
    responseObjectArrayAt(await preview(storyId, operations), 'diagnostics');

  expect(
    await diagnostics([
      { type: 'create_interaction', fields: { title: 'x', characterIds: [{ ref: 'ghost' }] } },
    ]),
  ).toEqual([
    expect.objectContaining({ code: 'UNKNOWN_REFERENCE', path: 'fields.characterIds.0' }),
  ]);
  // Declared by a later operation: not resolvable yet.
  expect(
    await diagnostics([
      { type: 'create_interaction', fields: { title: 'x', locationId: { ref: 'later' } } },
      { type: 'create_location', ref: 'later', fields: { name: 'Later' } },
    ]),
  ).toEqual([expect.objectContaining({ code: 'UNKNOWN_REFERENCE', operationIndex: 0 })]);
  expect(
    await diagnostics([
      { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
      { type: 'create_interaction', fields: { title: 'x', locationId: { ref: 'alya' } } },
    ]),
  ).toEqual([
    expect.objectContaining({
      code: 'REFERENCE_KIND_MISMATCH',
      details: { ref: 'alya', expected: 'location', actual: 'character' },
    }),
  ]);
  expect(
    await diagnostics([
      { type: 'create_location', ref: 'place', fields: { name: 'Place' } },
      { type: 'update_character', character: { ref: 'place' }, fields: { name: 'x' } },
    ]),
  ).toEqual([expect.objectContaining({ code: 'REFERENCE_KIND_MISMATCH', path: 'character' })]);
  expect(
    await diagnostics([
      { type: 'create_character', ref: 'same', fields: { name: 'A' } },
      { type: 'create_location', ref: 'same', fields: { name: 'B' } },
    ]),
  ).toEqual([expect.objectContaining({ code: 'DUPLICATE_REFERENCE' })]);
});

it('refuses characters and locations of another Story', async () => {
  const { storyId } = await createStory();
  const foreign = await createStory();
  const diagnostics = (operations: object[]) =>
    preview(storyId, operations).then((result) => responseObjectArrayAt(result, 'diagnostics'));
  const created = await preview(foreign.storyId, [
    { type: 'create_location', fields: { name: 'Elsewhere' } },
  ]);
  await post(`/api/stories/${foreign.storyId}/changes/commit`, commitBody(created)).expect(200);
  const foreignStory = await readStory(foreign.storyId);
  const foreignLocation = String(entityByName(foreignStory, 'locations', 'Elsewhere').id);

  expect(
    await diagnostics([
      { type: 'create_interaction', fields: { title: 'x', locationId: foreignLocation } },
    ]),
  ).toEqual([expect.objectContaining({ operationIndex: 0, code: 'INVALID_OPERATION' })]);
  expect(
    await diagnostics([
      { type: 'update_location', location: foreignLocation, fields: { name: 'x' } },
    ]),
  ).toEqual([expect.objectContaining({ operationIndex: 0, code: 'REFERENCE_NOT_FOUND' })]);
  expect(
    await diagnostics([
      {
        type: 'create_interaction',
        fields: { title: 'x' },
        defaultTrigger: {
          conditionGroups: [
            { conditions: [{ locationId: foreignLocation, isCurrentLocation: true }] },
          ],
        },
      },
    ]),
  ).toEqual([expect.objectContaining({ operationIndex: 0, code: 'INVALID_OPERATION' })]);
});

it('reports an unknown reference in a condition with its path', async () => {
  const { storyId } = await createStory();

  const result = await preview(storyId, [
    {
      type: 'create_interaction',
      fields: { title: 'x' },
      defaultTrigger: {
        conditionGroups: [{ conditions: [{ characterId: { ref: 'ghost' }, isPresent: true }] }],
      },
    },
  ]);

  expect(responseObjectArrayAt(result, 'diagnostics')).toEqual([
    expect.objectContaining({
      code: 'UNKNOWN_REFERENCE',
      path: 'defaultTrigger.conditionGroups.0.conditions.0.characterId',
    }),
  ]);
});

it('validates character and location fields like the editor', async () => {
  const { storyId } = await createStory();

  const result = await preview(storyId, [
    { type: 'create_character', fields: { name: '' } },
    { type: 'create_character', fields: { name: 'A', isPlayable: 'yes' } },
    { type: 'create_location', fields: { name: 'B', category: 'x'.repeat(101) } },
    { type: 'create_location', fields: { description: 'No name' } },
    { type: 'create_location', fields: { name: 'C', isPlayable: true } },
  ]);

  expect(result.valid).toBe(false);
  expect(result).not.toHaveProperty('proposalId');
  const diagnostics = responseObjectArrayAt(result, 'diagnostics');
  expect(new Set(diagnostics.map(({ operationIndex }) => operationIndex))).toEqual(
    new Set([0, 1, 2, 3, 4]),
  );
  expect(diagnostics.every(({ code }) => code === 'INVALID_FIELD')).toBe(true);
  expect(diagnostics.map(({ path }) => path)).toEqual(
    expect.arrayContaining([
      'fields.name',
      'fields.isPlayable',
      'fields.category',
      'fields.isPlayable',
    ]),
  );
  // An operation without its target is refused before any field is checked.
  const missing = await preview(storyId, [{ type: 'update_character', fields: { name: 'x' } }]);
  expect(responseObjectArrayAt(missing, 'diagnostics')).toEqual([
    expect.objectContaining({ code: 'REQUIRED_FIELD', path: 'character' }),
  ]);
});

it('rejects a whole stored context batch when a later operation fails at commit', async () => {
  const { storyId } = await createStory();
  const before = await storyState(storyId);
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
        { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
        { type: 'update_location', location: 'not-in-story', fields: { name: 'x' } },
      ]),
    ],
  );

  await post(`/api/stories/${storyId}/changes/commit`, { version: 1, proposalId }).expect(400);

  expect(await storyState(storyId)).toEqual(before);
  const story = await readStory(storyId);
  expect(responseObjectArrayAt(story, 'characters')).toEqual([]);
});

it('answers a retried context commit with the final IDs of the created entities', async () => {
  const { storyId, startId } = await createStory();
  const previewed = await preview(storyId, contextBatch(startId));
  const body = commitBody(previewed);
  const first = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, body).expect(200),
  );

  const retry = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, body).expect(200),
  );

  expect(retry).toMatchObject({
    status: 'already_applied',
    createdEntities: first.createdEntities,
  });
  expect(responseObjectArrayAt(retry, 'createdEntities').map(({ kind }) => kind)).toEqual(
    expect.arrayContaining(['character', 'location']),
  );
});

it('refuses a context commit when the Story changed after the preview', async () => {
  const { storyId, startId } = await createStory();
  const previewed = await preview(storyId, contextBatch(startId));
  await post(`/api/stories/${storyId}/characters`, { name: 'Someone else' }).expect(201);

  const conflict = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(409),
  );

  expect(conflict.code).toBe('STORY_REVISION_CONFLICT');
});

it('checks the character quota on the final Story', async () => {
  const { storyId } = await createStory();
  process.env.PARALLEAX_STORY_QUOTA_CHARACTERS = '1';
  try {
    const result = await preview(storyId, [
      { type: 'create_character', fields: { name: 'A' } },
      { type: 'create_character', fields: { name: 'B' } },
    ]);
    expect(result.valid).toBe(false);
    expect(responseObjectArrayAt(result, 'diagnostics')).toEqual([
      expect.objectContaining({ operationIndex: null, code: 'STORY_QUOTA_EXCEEDED' }),
    ]);
  } finally {
    delete process.env.PARALLEAX_STORY_QUOTA_CHARACTERS;
  }
});

it('lets readers neither preview nor commit context changes', async () => {
  const { storyId } = await createStory();
  await request(httpServer)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', owner)
    .send({ visibility: 'public', editPolicy: 'owner', commentPolicy: 'readers' })
    .expect(200);

  await post(
    `/api/stories/${storyId}/changes/preview`,
    { version: 1, operations: [{ type: 'create_character', fields: { name: 'A' } }] },
    other,
  ).expect(403);
});
