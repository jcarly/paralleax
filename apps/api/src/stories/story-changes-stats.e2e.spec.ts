import 'reflect-metadata';
import { Pool } from 'pg';
import * as request from 'supertest';
import { buildReaderProgressState, getAvailableInteractions, type Story } from '@paralleax/shared';
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

// Stat definitions, assignments, effects and conditions in change batches
// (ADR-050 amendment), against the real API and PostgreSQL.
const it = itWithPostgres;
const pool = new Pool({ connectionString: postgresTestDatabaseUrl });
const database = sharedPostgresTestConnection(pool);
let api: StoriesApi;
let httpServer: ApiHttpServer;

const owner = 'paralleax_session=user-one';

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

async function createStory() {
  const created = parseResponse(await post('/api/stories', { title: 'Transmission' }).expect(201));
  const storyId = responseStringAt(created, 'id');
  const start = parseResponse(await post(`/api/stories/${storyId}/interactions`, {}).expect(201));
  const itemDefinition = parseResponse(
    await post(`/api/stories/${storyId}/item-definitions`, { name: 'Resonator' }).expect(201),
  );
  return {
    storyId,
    startId: responseStringAt(start, 'interaction', 'id'),
    itemDefinitionId: responseStringAt(itemDefinition, 'itemDefinition', 'id'),
  };
}

async function preview(storyId: string, operations: object[]) {
  return parseResponse(
    await post(`/api/stories/${storyId}/changes/preview`, { version: 1, operations }).expect(200),
  );
}

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
  const events = await pool.query<{ operation: string }>(
    'SELECT operation FROM story_change_events WHERE story_id = $1 ORDER BY id',
    [storyId],
  );
  return {
    story,
    revision: responseNumberAt(story, 'revision'),
    events: events.rows.map(({ operation }) => operation),
  };
}

/**
 * The acceptance scenario, as plain succession of scenes: three "maintain"
 * steps lower the reserve from 100 to 80, 60 and 40, and two choices follow
 * each of them, available at `>= 60` and `< 60`.
 */
function scenarioBatch(startId: string, itemDefinitionId: string): object[] {
  return [...statOperations(itemDefinitionId), ...sceneOperations(startId)];
}

/** One reserve on the Story, one definition assigned to two characters and an item template. */
function statOperations(itemDefinitionId: string): object[] {
  const assign = (ref: string, assignee: object, initialValue: number) => ({
    type: 'create_stat_assignment',
    ref,
    statDefinition: { ref: 'calmDef' },
    owner: assignee,
    fields: { initialValue },
  });
  return [
    {
      type: 'create_stat_definition',
      ref: 'reserveDef',
      fields: { name: 'Réserve électrique', valueType: 'number' },
    },
    {
      type: 'create_stat_assignment',
      ref: 'reserve',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'story' },
      fields: { initialValue: 100 },
    },
    { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
    { type: 'create_character', ref: 'bruno', fields: { name: 'Bruno' } },
    {
      type: 'create_stat_definition',
      ref: 'calmDef',
      fields: { name: 'Sang-froid', valueType: 'number' },
    },
    assign('alyaCalm', { type: 'character', id: { ref: 'alya' } }, 50),
    assign('brunoCalm', { type: 'character', id: { ref: 'bruno' } }, 30),
    assign('resonatorCalm', { type: 'itemDefinition', id: itemDefinitionId }, 10),
  ];
}

function sceneOperations(startId: string): object[] {
  const steps = [
    { ref: 'maintain', title: 'Maintenir le résonateur actif', from: [startId] },
    { ref: 'again', title: 'Maintenir encore', from: [{ ref: 'maintain' }] },
    { ref: 'last', title: 'Maintenir une dernière fois', from: [{ ref: 'again' }] },
  ];
  return [
    ...steps.map(({ ref, title, from }) => ({
      type: 'create_interaction',
      ref,
      inputInteractions: from,
      fields: {
        title,
        statEffects: [{ statId: { ref: 'reserve' }, operation: 'add', value: -20 }],
      },
    })),
    ...[
      { ref: 'backup', title: 'Activer le protocole de secours', operator: 'gte' },
      { ref: 'lowPower', title: 'Basculer sur les batteries', operator: 'lt' },
    ].map(({ ref, title, operator }) => ({
      type: 'create_interaction',
      ref,
      inputInteractions: [{ ref: 'maintain' }, { ref: 'again' }, { ref: 'last' }],
      fields: { title },
      defaultTrigger: {
        conditionGroups: [{ conditions: [{ statId: { ref: 'reserve' }, operator, value: 60 }] }],
      },
    })),
  ];
}

async function commitScenario() {
  const context = await createStory();
  const operations = scenarioBatch(context.startId, context.itemDefinitionId);
  const before = await storyState(context.storyId);
  const previewed = await preview(context.storyId, operations);
  const committed = parseResponse(
    await post(`/api/stories/${context.storyId}/changes/commit`, commitBody(previewed)).expect(200),
  );
  return { ...context, operations, before, previewed, committed };
}

function isStory(body: ApiJsonObject): body is ApiJsonObject & Story {
  return typeof body.id === 'string' && Array.isArray(body.interactions);
}

function toStory(body: ApiJsonObject): Story {
  if (!isStory(body)) {
    throw new Error('The response is not a Story');
  }
  return body;
}

function titleId(story: Story, title: string): string {
  const found = story.interactions.find((interaction) => interaction.title === title);
  if (!found) {
    throw new Error(`Missing interaction ${title}`);
  }
  return found.id;
}

it('previews the whole scenario without writing anything', async () => {
  const { storyId, startId, itemDefinitionId } = await createStory();
  const before = await storyState(storyId);

  const result = await preview(storyId, scenarioBatch(startId, itemDefinitionId));

  expect(result).toMatchObject({ valid: true, diagnostics: [] });
  expect(await storyState(storyId)).toEqual(before);
  const story = toStory(before.story);
  expect(story.statDefinitions ?? []).toEqual([]);
  expect(story.stats ?? []).toEqual([]);
});

it('shows every definition, assignment, owner and initial value in the diff', async () => {
  const { previewed } = await commitScenario();

  expect(previewed).toMatchObject({
    summary: {
      provisionalIds: true,
      counts: {
        statDefinitionsAdded: 2,
        statAssignmentsAdded: 4,
        charactersAdded: 2,
        interactionsAdded: 5,
      },
      otherChangedFields: [],
    },
  });
  const assignments = responseObjectArrayAt(previewed, 'summary', 'statAssignments');
  const view = (ref: string) => assignments.find((assignment) => assignment.ref === ref);
  expect(view('reserve')).toMatchObject({
    change: 'added',
    definition: { ref: 'reserveDef', name: 'Réserve électrique', valueType: 'number' },
    owner: { type: 'story' },
    fields: [{ field: 'initialValue', after: 100 }],
  });
  expect(view('alyaCalm')).toMatchObject({
    definition: { ref: 'calmDef' },
    owner: { type: 'character', ref: 'alya', name: 'Alya' },
    fields: [{ field: 'initialValue', after: 50 }],
  });
  expect(view('brunoCalm')).toMatchObject({
    owner: { type: 'character', ref: 'bruno', name: 'Bruno' },
    fields: [{ field: 'initialValue', after: 30 }],
  });
  expect(view('resonatorCalm')).toMatchObject({
    owner: { type: 'itemDefinition', name: 'Resonator' },
    fields: [{ field: 'initialValue', after: 10 }],
  });
  // Stats are listed once, as assignments, not again as raw fields of characters.
  for (const character of responseObjectArrayAt(previewed, 'summary', 'characters')) {
    expect(JSON.stringify(character.fields)).not.toContain('initialValue');
  }
  // Effects and conditions name the created assignment by its reference.
  const maintain = responseObjectArrayAt(previewed, 'summary', 'interactions').find(
    ({ ref }) => ref === 'maintain',
  );
  expect(maintain?.fields).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: 'statEffects',
        references: [expect.objectContaining({ ref: 'reserve' })],
      }),
    ]),
  );
});

it('commits everything as one revision and one history event with final IDs', async () => {
  const { storyId, before, committed } = await commitScenario();

  const after = await storyState(storyId);
  expect(committed).toMatchObject({ status: 'committed', summary: { provisionalIds: false } });
  expect(after.revision).toBe(before.revision + 1);
  expect(after.events.slice(before.events.length)).toEqual(['story.changes.committed']);
  const story = toStory(after.story);
  const reserve = story.stats?.[0];
  expect(reserve).toMatchObject({ initialValue: 100 });
  const created = responseObjectArrayAt(committed, 'createdEntities');
  expect(created).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'statDefinition', ref: 'reserveDef' }),
      expect.objectContaining({ kind: 'statAssignment', ref: 'reserve', id: reserve?.id }),
    ]),
  );
  const maintain = story.interactions.find(({ title }) => title.startsWith('Maintenir le'));
  expect(maintain?.statEffects).toEqual([{ statId: reserve?.id, operation: 'add', value: -20 }]);
  const backup = story.interactions.find(({ title }) => title.startsWith('Activer'));
  expect(backup?.triggers[0].conditionGroups?.[0].conditions).toEqual([
    { statId: reserve?.id, operator: 'gte', value: 60 },
  ]);
});

function initialValuesByOwner(story: Story) {
  const values = (stats: Story['stats']) => (stats ?? []).map((stat) => stat.initialValue);
  const character = (name: string) => story.characters?.find((item) => item.name === name);
  return {
    alya: values(character('Alya')?.stats),
    bruno: values(character('Bruno')?.stats),
    item: values(story.itemDefinitions?.[0].stats),
  };
}

it('keeps independent values for one definition on two owners and on an item template', async () => {
  const { storyId } = await commitScenario();

  const story = toStory((await storyState(storyId)).story);

  expect(initialValuesByOwner(story)).toEqual({ alya: [50], bruno: [30], item: [10] });
  const [alya, bruno] = story.characters ?? [];
  const calm = story.statDefinitions?.find(({ name }) => name === 'Sang-froid');
  expect(alya.stats?.[0].statDefinitionId).toBe(calm?.id);
  expect(bruno.stats?.[0].statDefinitionId).toBe(calm?.id);
  expect(alya.stats?.[0].id).not.toBe(bruno.stats?.[0].id);
});

it('updates one owner’s value without touching the others', async () => {
  const { storyId } = await commitScenario();
  const story = toStory((await storyState(storyId)).story);
  const alya = story.characters?.[0];

  const updated = await preview(storyId, [
    {
      type: 'update_stat_assignment',
      assignment: alya?.stats?.[0].id,
      fields: { initialValue: 55 },
    },
  ]);

  expect(responseObjectArrayAt(updated, 'summary', 'statAssignments')).toEqual([
    expect.objectContaining({
      change: 'updated',
      owner: expect.objectContaining({ id: alya?.id }) as unknown,
      fields: [{ field: 'initialValue', before: 50, after: 55 }],
    }),
  ]);
});

it('makes the runtime follow the thresholds without changing the authored values', async () => {
  const { storyId, startId } = await commitScenario();
  const story = toStory((await storyState(storyId)).story);
  const reserveId = story.stats?.[0].id ?? '';
  const ids = {
    maintain: titleId(story, 'Maintenir le résonateur actif'),
    again: titleId(story, 'Maintenir encore'),
    last: titleId(story, 'Maintenir une dernière fois'),
  };
  const titlesAfter = (journey: string[]) => {
    const state = buildReaderProgressState(story, journey);
    const titles = getAvailableInteractions(
      story,
      state.currentInteractionId,
      state.visitedInteractionIds,
      state.currentLocationId,
      [],
      state.statValues,
    ).map(({ title }) => title);
    return { value: state.statValues[reserveId], titles };
  };

  expect(titlesAfter([startId]).value).toBe(100);
  expect(titlesAfter([startId, ids.maintain])).toMatchObject({
    value: 80,
    titles: expect.arrayContaining(['Activer le protocole de secours']) as unknown,
  });
  expect(titlesAfter([startId, ids.maintain]).titles).not.toContain('Basculer sur les batteries');
  // 60 is inside `>= 60`.
  expect(titlesAfter([startId, ids.maintain, ids.again])).toMatchObject({ value: 60 });
  expect(titlesAfter([startId, ids.maintain, ids.again]).titles).toContain(
    'Activer le protocole de secours',
  );
  const last = titlesAfter([startId, ids.maintain, ids.again, ids.last]);
  expect(last.value).toBe(40);
  expect(last.titles).toContain('Basculer sur les batteries');
  expect(last.titles).not.toContain('Activer le protocole de secours');
  // Going back replays the shorter journey; the authored value never moved.
  expect(titlesAfter([startId, ids.maintain]).value).toBe(80);
  expect(story.stats?.[0].initialValue).toBe(100);
  expect((await storyState(storyId)).story).toMatchObject({ stats: [{ initialValue: 100 }] });
});

it('answers a repeated commit without writing again, including after an undo', async () => {
  const { storyId, previewed, committed } = await commitScenario();
  const afterFirst = await storyState(storyId);

  const retry = parseResponse(
    await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(200),
  );

  expect(retry).toMatchObject({
    status: 'already_applied',
    revision: committed.revision,
    reverted: false,
  });
  expect(responseObjectArrayAt(retry, 'createdEntities')).toEqual(
    responseObjectArrayAt(committed, 'createdEntities'),
  );
  expect(await storyState(storyId)).toEqual(afterFirst);
});

it('undoes and redoes definitions, assignments, effects and conditions as one change', async () => {
  const { storyId, before } = await commitScenario();
  const committed = toStory((await storyState(storyId)).story);

  await post(`/api/stories/${storyId}/history/undo`, {}).expect(201);
  const undone = toStory((await storyState(storyId)).story);
  expect(undone.statDefinitions ?? []).toEqual([]);
  expect(undone.stats ?? []).toEqual([]);
  expect(undone.characters ?? []).toEqual([]);
  expect(undone.itemDefinitions?.[0].stats ?? []).toEqual([]);
  expect(undone.interactions).toHaveLength(toStory(before.story).interactions.length);

  await post(`/api/stories/${storyId}/history/redo`, {}).expect(201);
  const redone = toStory((await storyState(storyId)).story);
  expect(redone.statDefinitions).toEqual(committed.statDefinitions);
  expect(redone.stats).toEqual(committed.stats);
  expect(redone.interactions.map(({ statEffects }) => statEffects ?? [])).toEqual(
    committed.interactions.map(({ statEffects }) => statEffects ?? []),
  );
});

it('restores values, effects and conditions with new IDs when an export is imported', async () => {
  const { storyId } = await commitScenario();
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

  const copy = toStory(await readStory(responseStringAt(imported, 'id')));
  const original = toStory((await storyState(storyId)).story);
  const reserve = copy.stats?.[0];
  expect(reserve).toMatchObject({ initialValue: 100 });
  expect(reserve?.id).not.toBe(original.stats?.[0].id);
  expect(copy.characters?.map(({ name, stats }) => [name, stats?.[0].initialValue])).toEqual([
    ['Alya', 50],
    ['Bruno', 30],
  ]);
  const maintain = copy.interactions.find(({ title }) => title.startsWith('Maintenir le'));
  expect(maintain?.statEffects).toEqual([{ statId: reserve?.id, operation: 'add', value: -20 }]);
  const lowPower = copy.interactions.find(({ title }) => title.startsWith('Basculer'));
  expect(lowPower?.triggers[0].conditionGroups?.[0].conditions).toEqual([
    { statId: reserve?.id, operator: 'lt', value: 60 },
  ]);
});

it('keeps the editor endpoints working on batch-created definitions and assignments', async () => {
  const { storyId } = await commitScenario();
  const story = toStory((await storyState(storyId)).story);
  const alyaStat = story.characters?.[0].stats?.[0];

  await request(httpServer)
    .patch(`/api/stories/${storyId}/stats/${alyaStat?.id ?? ''}`)
    .set('Cookie', owner)
    .send({ initialValue: 65 })
    .expect(200);
  const context = parseResponse(
    await request(httpServer)
      .get(`/api/stories/${storyId}/editor/context`)
      .set('Cookie', owner)
      .expect(200),
  );
  const assignments = responseObjectArrayAt(context, 'statAssignments');
  expect(assignments).toHaveLength(4);
  expect(assignments.find(({ id }) => id === alyaStat?.id)).toMatchObject({
    initialValue: 65,
    ownerType: 'character',
  });
});

it('rolls the whole batch back when a rule fails and never stores an invalid proposal', async () => {
  const { storyId, startId } = await createStory();
  const before = await storyState(storyId);
  const batch = (initialValue: unknown) => [
    {
      type: 'create_stat_definition',
      ref: 'reserveDef',
      fields: { name: 'Reserve', valueType: 'number' },
    },
    {
      type: 'create_stat_assignment',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'story' },
      fields: { initialValue },
    },
    {
      type: 'create_interaction',
      inputInteractions: [startId],
      fields: { title: 'Never created' },
    },
  ];

  const invalid = await preview(storyId, batch('lots'));

  expect(invalid).toMatchObject({
    valid: false,
    diagnostics: [
      expect.objectContaining({
        operationIndex: 1,
        code: 'INVALID_OPERATION',
        message: 'Stat value must be a number',
      }),
    ],
  });
  expect(invalid).not.toHaveProperty('proposalId');
  expect(await storyState(storyId)).toEqual(before);
  await post(`/api/stories/${storyId}/changes/commit`, {
    version: 1,
    proposalId: 'f'.repeat(64),
  }).expect(404);
});

it('refuses a stale commit and writes nothing', async () => {
  const { storyId, startId, itemDefinitionId } = await createStory();
  const previewed = await preview(storyId, scenarioBatch(startId, itemDefinitionId));
  await post(`/api/stories/${storyId}/interactions`, {}).expect(201);
  const changed = await storyState(storyId);

  const stale = await post(`/api/stories/${storyId}/changes/commit`, commitBody(previewed)).expect(
    409,
  );

  expect(parseResponse(stale).code).toBe('STORY_REVISION_CONFLICT');
  expect(await storyState(storyId)).toEqual(changed);
});

it('refuses definitions and assignments outside the Story and unknown owners', async () => {
  const first = await createStory();
  const second = await createStory();
  const foreign = await preview(second.storyId, [
    {
      type: 'create_stat_definition',
      ref: 'reserveDef',
      fields: { name: 'Other', valueType: 'number' },
    },
    {
      type: 'create_stat_assignment',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'story' },
      fields: { initialValue: 1 },
    },
  ]);
  await post(`/api/stories/${second.storyId}/changes/commit`, commitBody(foreign)).expect(200);
  const foreignStory = toStory((await storyState(second.storyId)).story);
  const foreignDefinition = foreignStory.statDefinitions?.[0].id;
  const foreignAssignment = foreignStory.stats?.[0].id;

  const result = await preview(first.storyId, [
    {
      type: 'create_stat_assignment',
      statDefinition: foreignDefinition,
      owner: { type: 'story' },
      fields: { initialValue: 1 },
    },
    {
      type: 'update_stat_assignment',
      assignment: foreignAssignment,
      fields: { initialValue: 2 },
    },
  ]);

  expect(result).toMatchObject({ valid: false });
  expect(responseObjectArrayAt(result, 'diagnostics')[0]).toMatchObject({
    operationIndex: 0,
    code: 'REFERENCE_NOT_FOUND',
  });
});
