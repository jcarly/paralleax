import {
  createStoryChangeDelta,
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  toCanonicalTrigger,
  type Story,
} from '@paralleax/shared';
import type { DatabaseConnection } from '../database/database.connection';
import { Pool } from 'pg';
import { StoriesRepository } from './stories.repository';

type MockQueryResult = { rows?: Array<Record<string, unknown>>; rowCount?: number | null };
type QueryMock = jest.Mock<Promise<MockQueryResult>, [sql: string, values?: unknown[]]>;
type ClientMock = { query: QueryMock; release: jest.Mock<void, []> };

const mockQuery: QueryMock = jest.fn<Promise<MockQueryResult>, [string, unknown[]?]>();
const mockClientQuery: QueryMock = jest.fn<Promise<MockQueryResult>, [string, unknown[]?]>();
const mockRelease: jest.Mock<void, []> = jest.fn<void, []>();
const mockConnect: jest.Mock<Promise<ClientMock>, []> = jest.fn<Promise<ClientMock>, []>();
const ownerId = 'user-1';

const pool = new Proxy(new Pool(), {
  get(target, property) {
    if (property === 'query') {
      return mockQuery;
    }
    if (property === 'connect') {
      return mockConnect;
    }
    const value: unknown = Reflect.get(target, property);
    if (typeof value !== 'function') {
      return value;
    }
    return (...args: unknown[]) => {
      const result: unknown = Reflect.apply(value, target, args);
      return result;
    };
  },
});

const database: DatabaseConnection = {
  pool,
  async onModuleDestroy() {
    await pool.end();
  },
};

function story(id = 'story-1'): Story {
  return {
    id,
    title: 'Repository story',
    startDateTime: '2026-01-01T08:00',
    interactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function firstRequired<T>(values: T[] | undefined, description: string): T {
  const value = values?.[0];
  if (!value) {
    throw new Error(`Expected ${description}`);
  }
  return value;
}

function requiredStringParameter(values: unknown[] | undefined, index: number): string {
  const value = values?.[index];
  if (typeof value !== 'string') {
    throw new Error(`Expected SQL parameter ${index} to be a string`);
  }
  return value;
}

function graphStory(): Story {
  const saved = story();
  saved.graphDecorations = createGraphDecorations();
  saved.locations = createLocations();
  saved.statDefinitions = createStatDefinitions();
  saved.itemDefinitions = createItemDefinitions();
  saved.characters = createCharacters();
  saved.interactions = createInteractions();
  return saved;
}

function createGraphDecorations(): NonNullable<Story['graphDecorations']> {
  return [
    {
      id: 'frame-1',
      kind: 'frame',
      position: { x: 5, y: 15 },
      color: '#5b6ee1',
      width: 420,
      height: 240,
    },
    {
      id: 'text-1',
      kind: 'text',
      position: { x: 25, y: 35 },
      color: '#273043',
      text: 'Act one',
      fontSize: 32,
      fontFamily: 'sans',
      fontWeight: 'bold',
      fontStyle: 'italic',
    },
  ];
}

function createLocations(): NonNullable<Story['locations']> {
  return [{ id: 'location-1', name: 'Harbor', description: 'A quiet harbor.', category: 'Coast' }];
}

function createStatDefinitions(): NonNullable<Story['statDefinitions']> {
  return [
    {
      id: 'definition-1',
      name: 'Trust',
      valueType: 'number',
      category: 'Relationships',
      changePerHour: -0.5,
    },
  ];
}

function createItemDefinitions(): NonNullable<Story['itemDefinitions']> {
  return [
    {
      id: 'item-definition-1',
      name: 'Key',
      description: 'A brass key.',
      category: 'Quest items',
      stats: [{ id: 'item-stat-1', statDefinitionId: 'definition-1', initialValue: 8 }],
    },
  ];
}

function createCharacters(): NonNullable<Story['characters']> {
  return [
    {
      id: 'character-1',
      name: 'Mira',
      description: 'An investigator.',
      category: 'Allies',
      stats: [{ id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 2 }],
      items: [
        { id: 'item-1', itemDefinitionId: 'item-definition-1' },
        { id: 'item-2', itemDefinitionId: 'item-definition-1' },
      ],
    },
  ];
}

function createInteractions(): NonNullable<Story['interactions']> {
  return [createGraphFirstInteraction(), createGraphSecondInteraction()];
}

function createGraphFirstInteraction(): Story['interactions'][number] {
  return {
    id: 'interaction-1',
    title: 'Start',
    body: 'Begin here',
    position: { x: 10, y: 20 },
    locationId: 'location-1',
    characterIds: ['character-1'],
    statEffects: [
      { statId: 'stat-1', operation: 'add', value: 1 },
      { itemId: 'item-1', statId: 'item-stat-1', operation: 'add', value: -1 },
    ],
    itemEffects: [{ itemId: 'item-1', operation: 'obtain' }],
    durationMinutes: 15,
    triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
  };
}

function createGraphSecondInteraction(): Story['interactions'][number] {
  return {
    id: 'interaction-2',
    title: 'Next',
    body: 'Continue here',
    position: { x: 30, y: 40 },
    durationMinutes: 0,
    triggers: [
      {
        id: 'trigger-2',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
        position: { x: 220, y: 160 },
      },
    ],
  };
}

function storyRow(value = story()) {
  return {
    id: value.id,
    revision: value.revision ?? 1,
    title: value.title,
    creator_user_id: ownerId,
    owner_email: 'owner@example.com',
    owner_display_name: 'Owner',
    visibility: 'private',
    edit_policy: 'owner',
    comment_policy: 'editors',
    actor_id: ownerId,
    actor_role: 'user',
    collaborator_role: null,
    start_date_time: value.startDateTime,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt),
  };
}

function repository() {
  return new StoriesRepository(database);
}

function relationalRead(query: QueryMock, saved = story()) {
  query.mockImplementation((sql) => {
    const reader = relationalReaders.find((candidate) => sql.includes(candidate.table));
    return reader ? reader.read(saved) : Promise.resolve({ rows: [] });
  });
}

type RelationalReader = (saved: Story) => Promise<MockQueryResult>;

const relationalReaders: Array<{ table: string; read: RelationalReader }> = [
  { table: 'FROM stories', read: readStories },
  { table: 'FROM trigger_inputs', read: readTriggerInputs },
  { table: 'FROM locations', read: readLocations },
  { table: 'FROM graph_decorations', read: readGraphDecorations },
  { table: 'FROM interaction_characters', read: readInteractionCharacters },
  { table: 'FROM interaction_stat_effects', read: readInteractionStatEffects },
  { table: 'FROM interaction_item_effects', read: readInteractionItemEffects },
  { table: 'FROM stat_definitions', read: readStatDefinitions },
  { table: 'FROM stat_assignments', read: readStatAssignments },
  { table: 'FROM item_definitions', read: readItemDefinitions },
  { table: 'FROM item_instances', read: readItemInstances },
  { table: 'FROM item_instance_relationships', read: readItemInstanceRelationships },
  { table: 'FROM characters', read: readCharacters },
  { table: 'FROM triggers', read: readTriggers },
  { table: 'FROM interactions', read: readInteractions },
];

function readStories(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({ rows: [storyRow(saved)], rowCount: 1 });
}

function readTriggerInputs(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: saved.interactions.flatMap((interaction) =>
      interaction.triggers.flatMap((trigger) =>
        trigger.inputInteractionIds.map((inputId, index) => ({
          story_id: saved.id,
          trigger_id: trigger.id,
          input_interaction_id: inputId,
          sort_order: index,
        })),
      ),
    ),
  });
}

function readLocations(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: (saved.locations ?? []).map((location, index) => ({
      id: location.id,
      story_id: saved.id,
      name: location.name,
      description: location.description,
      category: location.category ?? '',
      sort_order: index,
    })),
  });
}

function readGraphDecorations(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: (saved.graphDecorations ?? []).map((decoration, index) => ({
      id: decoration.id,
      story_id: saved.id,
      kind: decoration.kind,
      position_x: decoration.position.x,
      position_y: decoration.position.y,
      width: decoration.kind === 'frame' ? decoration.width : null,
      height: decoration.kind === 'frame' ? decoration.height : null,
      text_content: decoration.kind === 'text' ? decoration.text : null,
      color: decoration.color,
      font_size: decoration.kind === 'text' ? decoration.fontSize : null,
      font_family: decoration.kind === 'text' ? decoration.fontFamily : null,
      font_weight: decoration.kind === 'text' ? decoration.fontWeight : null,
      font_style: decoration.kind === 'text' ? decoration.fontStyle : null,
      sort_order: index,
    })),
  });
}

function readInteractionCharacters(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: saved.interactions.flatMap((interaction) =>
      (interaction.characterIds ?? []).map((characterId, index) => ({
        story_id: saved.id,
        interaction_id: interaction.id,
        character_id: characterId,
        sort_order: index,
      })),
    ),
  });
}

function readInteractionStatEffects(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: saved.interactions.flatMap((interaction) =>
      (interaction.statEffects ?? []).map((effect, index) => ({
        story_id: saved.id,
        interaction_id: interaction.id,
        stat_id: effect.statId,
        item_id: effect.itemId ?? null,
        operation: effect.operation,
        value: effect.value,
        sort_order: index,
      })),
    ),
  });
}

function readInteractionItemEffects(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: saved.interactions.flatMap((interaction) =>
      (interaction.itemEffects ?? []).map((effect, index) => ({
        story_id: saved.id,
        interaction_id: interaction.id,
        item_id: effect.itemId,
        operation: effect.operation,
        sort_order: index,
      })),
    ),
  });
}

function readStatDefinitions(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: (saved.statDefinitions ?? []).map((definition, index) => ({
      id: definition.id,
      story_id: saved.id,
      name: definition.name,
      value_type: definition.valueType,
      category: definition.category ?? '',
      image_url: definition.imageUrl ?? '',
      change_per_hour: definition.changePerHour ?? 0,
      sort_order: index,
    })),
  });
}

function readStatAssignments(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: collectStatAssignments(saved).map((assignment) => statAssignmentRow(saved, assignment)),
  });
}

function collectStatAssignments(saved: Story) {
  return [
    ...(saved.stats ?? []).map((stat, index) => ({
      stat,
      owner_type: 'story',
      character_id: null,
      location_id: null,
      item_definition_id: null,
      sort_order: index,
    })),
    ...(saved.characters ?? []).flatMap((character) =>
      (character.stats ?? []).map((stat, index) => ({
        stat,
        owner_type: 'character',
        character_id: character.id,
        location_id: null,
        item_definition_id: null,
        sort_order: index,
      })),
    ),
    ...(saved.locations ?? []).flatMap((location) =>
      (location.stats ?? []).map((stat, index) => ({
        stat,
        owner_type: 'location',
        character_id: null,
        location_id: location.id,
        item_definition_id: null,
        sort_order: index,
      })),
    ),
    ...(saved.itemDefinitions ?? []).flatMap((definition) =>
      (definition.stats ?? []).map((stat, index) => ({
        stat,
        owner_type: 'item_definition',
        character_id: null,
        location_id: null,
        item_definition_id: definition.id,
        sort_order: index,
      })),
    ),
  ];
}

function statAssignmentRow(
  saved: Story,
  { stat, ...owner }: ReturnType<typeof collectStatAssignments>[number],
) {
  return {
    id: stat.id,
    story_id: saved.id,
    stat_definition_id: stat.statDefinitionId,
    initial_value: stat.initialValue,
    ...owner,
  };
}

function readItemDefinitions(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: (saved.itemDefinitions ?? []).map((definition, index) => ({
      id: definition.id,
      story_id: saved.id,
      name: definition.name,
      description: definition.description,
      category: definition.category ?? '',
      image_url: definition.imageUrl ?? '',
      sort_order: index,
    })),
  });
}

function readItemInstances(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: [
      ...(saved.characters ?? []).flatMap((character) =>
        (character.items ?? []).map((item, index) => ({
          id: item.id,
          story_id: saved.id,
          character_id: item.parentItemId ? null : character.id,
          location_id: null,
          item_definition_id: item.itemDefinitionId,
          sort_order: index,
        })),
      ),
      ...(saved.locations ?? []).flatMap((location) =>
        (location.items ?? []).map((item, index) => ({
          id: item.id,
          story_id: saved.id,
          character_id: null,
          location_id: item.parentItemId ? null : location.id,
          item_definition_id: item.itemDefinitionId,
          sort_order: index,
        })),
      ),
    ],
  });
}

function readItemInstanceRelationships(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: [...(saved.characters ?? []), ...(saved.locations ?? [])].flatMap((owner) =>
      (owner.items ?? []).flatMap((item, index) =>
        item.parentItemId && item.relationshipType
          ? [
              {
                story_id: saved.id,
                parent_item_id: item.parentItemId,
                child_item_id: item.id,
                relationship_type: item.relationshipType,
                slot_key: item.slotKey ?? null,
                sort_order: index,
              },
            ]
          : [],
      ),
    ),
  });
}

function readCharacters(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: (saved.characters ?? []).map((character, index) => ({
      id: character.id,
      story_id: saved.id,
      name: character.name,
      description: character.description,
      category: character.category ?? '',
      sort_order: index,
    })),
  });
}

function readTriggers(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: saved.interactions.flatMap((interaction) =>
      interaction.triggers.map((trigger, index) => ({
        id: trigger.id,
        story_id: saved.id,
        output_interaction_id: interaction.id,
        position_x: trigger.position?.x ?? null,
        position_y: trigger.position?.y ?? null,
        sort_order: index,
        condition_groups: getTriggerConditionGroups(trigger),
        appearance_probability: getTriggerAppearanceProbability(trigger),
        timer_seconds: getTriggerTimerSeconds(trigger),
      })),
    ),
  });
}

function readInteractions(saved: Story): Promise<MockQueryResult> {
  return Promise.resolve({
    rows: saved.interactions.map((interaction, index) => ({
      id: interaction.id,
      story_id: saved.id,
      title: interaction.title,
      body: interaction.body,
      position_x: interaction.position.x,
      position_y: interaction.position.y,
      location_id: interaction.locationId ?? null,
      duration_minutes: interaction.durationMinutes ?? 0,
      conditional_text_blocks: interaction.conditionalTextBlocks ?? [],
      sort_order: index,
    })),
  });
}

describe('StoriesRepository', registerRepositorySuite);

function registerRepositorySuite() {
  beforeEach(resetRepositoryMocks);
  registerReadTests();
  registerSaveTests();
  registerMutationTests();
  registerInventoryTests();
}

function resetRepositoryMocks() {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
}

function registerReadTests() {
  it('lists lightweight story summaries without assembling graphs', runListLightweightSummaries);
  it('lists only public story summaries with anonymous capabilities', runListPublicSummaries);
  it('finds and assembles a story by id', runFindAndAssembleStory);
  it.each(invalidDecorationCases)(
    'rejects persisted $kind decorations with missing required fields',
    rejectInvalidDecoration,
  );
  it(
    'assembles typed stat definitions, owner assignments, and interaction effects',
    runTypedStatAssignments,
  );
  it(
    'returns no stories without querying graph tables when metadata is empty',
    runEmptyStoryListing,
  );
}

function registerSaveTests() {
  it('saves the story metadata and graph transactionally', runTransactionalSave);
  it('saves a demo catalog in one transaction', runTransactionalCatalogSave);
  it('inserts relational interactions, triggers, inputs, and conditions', runRelationalGraphInsert);
  it('deletes stories by owner and id', runDeleteByOwner);
}

function registerMutationTests() {
  it('writes only changed story fields during a mutation', runFieldLevelMutation);
  it('records a versioned authored mutation in the same transaction', runVersionedMutation);
  it('applies a compatible history inverse and appends its undo event', runHistoryInverse);
  it(
    'writes typed stat effects without replacing unchanged definitions or assignments',
    runTypedStatMutation,
  );
  it(
    'writes expression stat effects through the relational mutation path',
    runExpressionStatMutation,
  );
  it('persists interaction and trigger graph differences', runGraphDifferences);
}

function registerInventoryTests() {
  it(
    'persists a typed parent relationship and removes the child root owner',
    runParentItemRelationship,
  );
  it(
    'transfers an item by id without deleting and recreating it',
    runItemTransferBetweenCharacters,
  );
  it('transfers an item from a character root to a location root', runItemTransferToLocation);
  it('rolls back and releases the transaction when a mutation fails', runMutationRollback);
  it('reads, upserts, and deletes user-scoped reader progress', runReaderProgressPersistence);
}

type InvalidDecorationCase = {
  kind: 'frame' | 'text';
  width: number | null;
  height: number | null;
  text_content: string | null;
  font_size: number | null;
  font_family: string | null;
  font_weight: string | null;
  font_style: string | null;
  expectedError: string;
};

const invalidDecorationCases: InvalidDecorationCase[] = [
  {
    kind: 'frame',
    width: null,
    height: 240,
    text_content: null,
    font_size: null,
    font_family: null,
    font_weight: null,
    font_style: null,
    expectedError: 'Invalid persisted frame decoration: dimensions are missing',
  },
  {
    kind: 'text',
    width: null,
    height: null,
    text_content: 'Act one',
    font_size: null,
    font_family: 'sans',
    font_weight: 'bold',
    font_style: 'italic',
    expectedError: 'Invalid persisted text decoration: content or style is missing',
  },
];

async function rejectInvalidDecoration(decoration: InvalidDecorationCase) {
  const saved = graphStory();
  mockClientQuery.mockImplementation((sql) => {
    if (sql.includes('FROM stories')) {
      return Promise.resolve({ rows: [storyRow(saved)], rowCount: 1 });
    }
    if (sql.includes('FROM graph_decorations')) {
      return Promise.resolve({ rows: [invalidDecorationRow(saved.id, decoration)] });
    }
    return Promise.resolve({ rows: [] });
  });

  await expect(repository().find(saved.id, ownerId)).rejects.toThrow(decoration.expectedError);
  expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK');
}

function invalidDecorationRow(storyId: string, decoration: InvalidDecorationCase) {
  return {
    id: `${decoration.kind}-1`,
    story_id: storyId,
    kind: decoration.kind,
    position_x: 5,
    position_y: 15,
    width: decoration.width,
    height: decoration.height,
    text_content: decoration.text_content,
    color: '#273043',
    font_size: decoration.font_size,
    font_family: decoration.font_family,
    font_weight: decoration.font_weight,
    font_style: decoration.font_style,
    sort_order: 0,
  };
}

async function runListLightweightSummaries() {
  const saved = story();
  mockQuery.mockResolvedValueOnce({ rows: [lightweightSummaryRow(saved)] });
  const listed = await repository().list(ownerId);
  expect(listed).toEqual(lightweightSummaryResult(saved));
  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('AS interaction_count'), [
    ownerId,
    '',
    24,
    0,
  ]);
}

function lightweightSummaryRow(saved: Story) {
  return {
    id: saved.id,
    revision: 1,
    title: saved.title,
    creator_user_id: ownerId,
    owner_email: 'owner@example.com',
    owner_display_name: 'Owner',
    visibility: 'private',
    edit_policy: 'owner',
    comment_policy: 'editors',
    actor_id: ownerId,
    actor_role: 'user',
    collaborator_role: null,
    start_date_time: saved.startDateTime,
    created_at: saved.createdAt,
    updated_at: saved.updatedAt,
    interaction_count: '3',
    total_count: '1',
  };
}

function lightweightSummaryResult(saved: Story) {
  return {
    items: [
      {
        id: saved.id,
        revision: 1,
        title: saved.title,
        interactionCount: 3,
        startDateTime: saved.startDateTime,
        access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
        capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
        owner: { id: ownerId, displayName: 'Owner' },
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    ],
    page: 1,
    pageSize: 24,
    totalCount: 1,
    hasMore: false,
  };
}

async function runListPublicSummaries() {
  const saved = story();
  const publicRow = { ...storyRow(saved) };
  Reflect.deleteProperty(publicRow, 'owner_email');
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        ...publicRow,
        visibility: 'public',
        actor_id: null,
        actor_role: null,
        interaction_count: '2',
        total_count: '1',
      },
    ],
  });

  await expect(repository().listPublic()).resolves.toEqual({
    items: [
      {
        id: saved.id,
        revision: 1,
        title: saved.title,
        interactionCount: 2,
        startDateTime: saved.startDateTime,
        access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
        owner: { id: ownerId, displayName: 'Owner' },
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    ],
    page: 1,
    pageSize: 24,
    totalCount: 1,
    hasMore: false,
  });
  expect(mockQuery.mock.calls[0]?.[0]).toEqual(expect.stringContaining("visibility = 'public'"));
  expect(mockQuery.mock.calls[0]?.[0]).toEqual(expect.not.stringContaining('owner.email'));
  expect(mockQuery.mock.calls[0]?.[1]).toEqual(['', 24, 0]);
}

async function runFindAndAssembleStory() {
  const saved = graphStory();
  relationalRead(mockClientQuery, saved);

  await expect(repository().find(saved.id, ownerId)).resolves.toEqual({
    ...saved,
    revision: 1,
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    owner: { id: ownerId, displayName: 'Owner' },
    groups: saved.groups ?? [],
    characters: saved.characters,
    interactions: saved.interactions.map((interaction) => ({
      ...interaction,
      locationId: interaction.locationId ?? null,
      characterIds: interaction.characterIds ?? [],
      statEffects: interaction.statEffects ?? [],
      itemEffects: interaction.itemEffects ?? [],
      conditionalTextBlocks: interaction.conditionalTextBlocks ?? [],
      triggers: interaction.triggers.map(toCanonicalTrigger),
    })),
  });
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE stories.id = $1'), [
    saved.id,
    ownerId,
  ]);
  expect(mockClientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
  expect(mockClientQuery).toHaveBeenNthCalledWith(
    2,
    'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  );
  expect(mockClientQuery).toHaveBeenLastCalledWith('COMMIT');
  expect(mockQuery).not.toHaveBeenCalled();
}

async function runTypedStatAssignments() {
  const saved = graphStory();
  configureTypedStatFixture(saved);
  relationalRead(mockClientQuery, saved);

  const loaded = await repository().find(saved.id, ownerId);
  expect(loaded?.statDefinitions).toEqual(saved.statDefinitions);
  expect(loaded?.stats).toEqual(saved.stats);
  expect(loaded?.characters?.[0]).toMatchObject({
    id: 'character-1',
    stats: firstRequired(saved.characters, 'saved character').stats,
  });
  expect(loaded?.itemDefinitions?.[0]).toMatchObject({
    id: 'item-definition-1',
    stats: firstRequired(saved.itemDefinitions, 'saved item definition').stats,
  });
  expect(loaded?.interactions[0]).toMatchObject({
    id: 'interaction-1',
    statEffects: saved.interactions[0].statEffects,
  });
}

function configureTypedStatFixture(saved: Story) {
  saved.statDefinitions = [
    {
      id: 'alarm-definition',
      name: 'Alarm',
      valueType: 'boolean',
    },
    {
      id: 'charge-definition',
      name: 'Charge',
      valueType: 'number',
    },
  ];
  saved.stats = [
    {
      id: 'story-stat-1',
      statDefinitionId: 'alarm-definition',
      initialValue: false,
    },
  ];
  firstRequired(saved.characters, 'fixture character').stats = [
    {
      id: 'character-stat-1',
      statDefinitionId: 'charge-definition',
      initialValue: 2,
    },
  ];
  firstRequired(saved.itemDefinitions, 'fixture item definition').stats = [
    {
      id: 'item-stat-1',
      statDefinitionId: 'charge-definition',
      initialValue: 10,
    },
  ];
  saved.interactions[0].statEffects = [
    {
      statId: 'story-stat-1',
      operation: 'set',
      value: true,
    },
    {
      statId: 'item-stat-1',
      itemId: 'item-1',
      operation: 'add',
      value: -1,
    },
  ];
}

async function runEmptyStoryListing() {
  mockQuery.mockResolvedValue({ rows: [] });
  await expect(repository().list(ownerId)).resolves.toEqual({
    items: [],
    page: 1,
    pageSize: 24,
    totalCount: 0,
    hasMore: false,
  });
  expect(mockQuery).toHaveBeenCalledTimes(1);
}

async function runTransactionalSave() {
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  const saved = story();

  await repository().save(saved, ownerId);

  expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id)'), [
    saved.id,
    1,
    saved.title,
    saved.startDateTime,
    saved.createdAt,
    saved.updatedAt,
    ownerId,
    'private',
    'owner',
    'editors',
  ]);
  expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM interactions WHERE story_id = $1', [
    saved.id,
  ]);
  expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
}

async function runTransactionalCatalogSave() {
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  const first = story();
  const second = { ...story(), id: 'story-2', title: 'Second demo' };

  await repository().saveMany([first, second], ownerId);

  expect(mockClientQuery.mock.calls.filter(([sql]) => sql === 'BEGIN')).toHaveLength(1);
  expect(mockClientQuery.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id)'), [
    second.id,
    1,
    second.title,
    second.startDateTime,
    second.createdAt,
    second.updatedAt,
    ownerId,
    'private',
    'owner',
    'editors',
  ]);
}

async function runRelationalGraphInsert() {
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  const saved = graphStory();
  await repository().save(saved, ownerId);
  expectInsertedBaseRows(saved);
  expectInsertedDecorationRows(saved);
  expectInsertedCatalogRows(saved);
  expectInsertedItemsAndEffects(saved);
  expectInsertedTriggers();
}

function expectInsertedBaseRows(saved: Story) {
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO locations'), [
    'location-1',
    saved.id,
    'Harbor',
    'A quiet harbor.',
    'Coast',
    '',
    0,
  ]);
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interactions'),
    [expect.stringContaining('"id":"interaction-1"')],
  );
}

function expectInsertedDecorationRows(saved: Story) {
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO graph_decorations'),
    ['frame-1', saved.id, 'frame', 5, 15, 420, 240, null, '#5b6ee1', null, null, null, null, 0],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO graph_decorations'),
    [
      'text-1',
      saved.id,
      'text',
      25,
      35,
      null,
      null,
      'Act one',
      '#273043',
      32,
      'sans',
      'bold',
      'italic',
      1,
    ],
  );
}

function expectInsertedCatalogRows(saved: Story) {
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO characters'), [
    'character-1',
    saved.id,
    'Mira',
    'An investigator.',
    'Allies',
    '',
    false,
    0,
  ]);
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interaction_characters'),
    [expect.stringContaining('"character_id":"character-1"')],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO stat_definitions'),
    ['definition-1', saved.id, 'Trust', 'number', 'Relationships', '', -0.5, 0],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO item_definitions'),
    ['item-definition-1', saved.id, 'Key', 'A brass key.', 'Quest items', '', 0],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO stat_assignments'),
    [expect.stringContaining('"id":"stat-1"')],
  );
}

function expectInsertedItemsAndEffects(saved: Story) {
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO item_instances'),
    ['item-1', saved.id, 'character-1', null, 'item-definition-1', 0],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO item_instances'),
    ['item-2', saved.id, 'character-1', null, 'item-definition-1', 1],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interaction_stat_effects'),
    [expect.stringContaining('"stat_id":"stat-1"')],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interaction_item_effects'),
    [expect.stringContaining('"item_id":"item-1"')],
  );
}

function expectInsertedTriggers() {
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO triggers'), [
    expect.stringContaining('"id":"trigger-2"'),
  ]);
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO trigger_inputs'),
    [expect.stringContaining('"trigger_id":"trigger-2"')],
  );
}

async function runDeleteByOwner() {
  mockQuery.mockResolvedValue({ rowCount: 1 });
  await expect(repository().delete('story-1', ownerId)).resolves.toBe(true);
  expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM stories'), [
    'story-1',
    ownerId,
  ]);
}

async function runFieldLevelMutation() {
  const saved = story();
  let current = saved;
  mockClientQuery.mockImplementation((sql, values) => {
    if (sql.includes('FROM stories')) {
      return Promise.resolve({ rows: [storyRow(current)], rowCount: 1 });
    }
    if (sql.startsWith('UPDATE stories SET')) {
      current = {
        ...current,
        title: requiredStringParameter(values, 1),
        updatedAt: requiredStringParameter(values, 2),
      };
    }
    return Promise.resolve({ rows: [], rowCount: 1 });
  });

  const updated = await repository().mutate(
    saved.id,
    (value) => ({
      ...value,
      title: 'Updated transactionally',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }),
    ownerId,
  );

  expect(updated?.title).toBe('Updated transactionally');
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE stories SET title = $2, updated_at = $3'),
    [saved.id, 'Updated transactionally', '2026-01-02T00:00:00.000Z'],
  );
  expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  expect(mockClientQuery).not.toHaveBeenCalledWith(
    'DELETE FROM stat_definitions WHERE story_id = $1',
    [saved.id],
  );
}

async function runVersionedMutation() {
  const saved = { ...story(), revision: 1 };
  relationalRead(mockClientQuery, saved);
  const relationalImplementation = mockClientQuery.getMockImplementation();
  if (!relationalImplementation) {
    throw new Error('Expected relational query mock implementation');
  }
  mockClientQuery.mockImplementation((sql: string, values?: unknown[]) => {
    if (sql.includes('INSERT INTO story_change_events')) {
      return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
    }
    return relationalImplementation(sql, values);
  });

  await repository().mutate(
    saved.id,
    (value) => ({
      ...value,
      revision: 2,
      title: 'Versioned title',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }),
    ownerId,
  );

  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO story_change_events'),
    expect.arrayContaining([saved.id, ownerId, 2, 'change', 'story.updated']),
  );
  expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
}

async function runHistoryInverse() {
  const current = {
    ...story(),
    revision: 2,
    title: 'Changed title',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
  const original = { ...current, revision: 1, title: 'Repository story' };
  const changes = createStoryChangeDelta(original, current);
  if (!changes) {
    throw new Error('Expected a story change delta');
  }
  const savedRepository = repository();
  const hasEditAccess = jest.fn(async () => true);
  const findWith = jest.fn(async () => current);
  Object.defineProperty(savedRepository, 'hasEditAccess', {
    configurable: true,
    value: hasEditAccess,
  });
  Object.defineProperty(savedRepository, 'findWith', { configurable: true, value: findWith });
  mockClientQuery.mockImplementation((sql) =>
    Promise.resolve(historyQueryResult(sql, current, changes)),
  );

  await expect(savedRepository.revertHistory(current.id, ownerId, 'undo')).resolves.toMatchObject({
    kind: 'applied',
    result: {
      story: { title: original.title, revision: 3 },
      history: { canUndo: false, canRedo: true },
    },
  });
  expectHistoryUndoCommit(current.id, findWith);
}

function historyQueryResult(
  sql: string,
  current: Story,
  changes: NonNullable<ReturnType<typeof createStoryChangeDelta>>,
): MockQueryResult {
  if (sql.includes('LIMIT 1')) {
    return {
      rows: [
        {
          id: 1,
          revision: 2,
          kind: 'change',
          operation: 'story.updated',
          changes,
          actor_user_id: ownerId,
          actor_display_name: 'Owner',
          created_at: current.updatedAt,
          reverted: false,
        },
      ],
    };
  }
  if (sql.includes('INSERT INTO story_change_events')) {
    return { rows: [{ id: 2 }], rowCount: 1 };
  }
  if (sql.includes('WITH recent_entries')) {
    return { rows: [{ id: null, can_undo: false, can_redo: true }] };
  }
  if (sql.includes('ORDER BY event.id DESC')) {
    return { rows: [] };
  }
  return { rows: [], rowCount: 1 };
}

function expectHistoryUndoCommit(storyId: string, findWith: jest.Mock) {
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO story_change_events'),
    expect.arrayContaining([storyId, ownerId, 3, 'undo', 'story.updated']),
  );
  expect(findWith).toHaveBeenCalledTimes(1);
  expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
}

async function runTypedStatMutation() {
  const saved = graphStory();
  saved.stats = [
    {
      id: 'story-stat-1',
      statDefinitionId: 'definition-1',
      initialValue: 0,
    },
  ];
  relationalRead(mockClientQuery, saved);

  await repository().mutate(
    saved.id,
    (value) => {
      value.interactions[0].statEffects = [
        {
          statId: 'story-stat-1',
          operation: 'set',
          value: 5,
        },
      ];
      return value;
    },
    ownerId,
  );

  expect(mockClientQuery).not.toHaveBeenCalledWith(
    'DELETE FROM stat_assignments WHERE story_id = $1',
    [saved.id],
  );
  expect(mockClientQuery).not.toHaveBeenCalledWith(
    'DELETE FROM stat_definitions WHERE story_id = $1',
    [saved.id],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interaction_stat_effects'),
    [saved.id, 'interaction-1', 'story-stat-1', null, 'set', JSON.stringify(5), null, 0],
  );
}

async function runExpressionStatMutation() {
  const saved = graphStory();
  saved.stats = [{ id: 'story-stat-1', statDefinitionId: 'definition-1', initialValue: 0 }];
  relationalRead(mockClientQuery, saved);

  await repository().mutate(
    saved.id,
    (value) => {
      value.interactions[0].statEffects = [
        { statId: 'story-stat-1', operation: 'set', expression: '@{story-stat-1} + 1' },
      ];
      return value;
    },
    ownerId,
  );

  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO interaction_stat_effects'),
    [saved.id, 'interaction-1', 'story-stat-1', null, 'set', null, '@{story-stat-1} + 1', 0],
  );
}

async function runGraphDifferences() {
  const saved = graphStory();
  relationalRead(mockClientQuery, saved);
  await repository().mutate(saved.id, applyGraphDifferences, ownerId);
  expectInteractionWrites(saved.id);
  expectTriggerWrites(saved.id);
  expectDecorationWrites(saved.id);
}

function applyGraphDifferences(value: Story): Story {
  value.interactions[0].title = 'Renamed start';
  value.interactions[0].position = { x: 50, y: 60 };
  value.interactions[0].triggers[0].conditionGroups = [
    { id: 'trigger-1', conditions: [{ interactionId: 'interaction-1', hasBeenVisited: false }] },
  ];
  value.interactions[0].triggers[0].position = { x: 210, y: 175 };
  value.interactions[0].triggers.push({ id: 'trigger-3', inputInteractionIds: [], conditions: [] });
  value.interactions.splice(1, 1);
  const frame = value.graphDecorations?.find(({ id }) => id === 'frame-1');
  if (!frame || frame.kind !== 'frame') {
    throw new Error('Expected the frame decoration');
  }
  frame.position = { x: 15, y: 25 };
  frame.width = 500;
  value.graphDecorations = [frame, newTextDecoration()];
  return value;
}

function newTextDecoration(): NonNullable<Story['graphDecorations']>[number] {
  return {
    id: 'text-2',
    kind: 'text',
    position: { x: 70, y: 80 },
    color: '#123456',
    text: 'New label',
    fontSize: 24,
    fontFamily: 'serif',
    fontWeight: 'normal',
    fontStyle: 'italic',
  };
}

function expectInteractionWrites(storyId: string) {
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE interactions SET title = $2'),
    ['interaction-1', 'Renamed start'],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE interactions AS target'),
    [JSON.stringify([{ id: 'interaction-1', position_x: 50, position_y: 60 }]), storyId],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    'DELETE FROM interactions WHERE id = $1 AND story_id = $2',
    ['interaction-2', storyId],
  );
}

function expectTriggerWrites(storyId: string) {
  expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO triggers'), [
    'trigger-3',
    storyId,
    'interaction-1',
    null,
    null,
    JSON.stringify([{ id: 'trigger-3', conditions: [] }]),
    100,
    null,
    1,
  ]);
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE triggers AS target'),
    [JSON.stringify([{ id: 'trigger-1', position_x: 210, position_y: 175 }]), storyId],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining(
      'SET condition_groups = $2, appearance_probability = $3, timer_seconds = $4',
    ),
    [
      'trigger-1',
      JSON.stringify([
        {
          id: 'trigger-1',
          conditions: [{ interactionId: 'interaction-1', hasBeenVisited: false }],
        },
      ]),
      100,
      null,
    ],
  );
  expect(mockClientQuery).not.toHaveBeenCalledWith(
    'DELETE FROM trigger_inputs WHERE trigger_id = $1',
    ['trigger-1'],
  );
}

function expectDecorationWrites(storyId: string) {
  expect(mockClientQuery).toHaveBeenCalledWith(
    'DELETE FROM graph_decorations WHERE id = $1 AND story_id = $2',
    ['text-1', storyId],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining(
      'UPDATE graph_decorations SET position_x = $2, position_y = $3, width = $4',
    ),
    ['frame-1', 15, 25, 500],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO graph_decorations'),
    [
      'text-2',
      storyId,
      'text',
      70,
      80,
      null,
      null,
      'New label',
      '#123456',
      24,
      'serif',
      'normal',
      'italic',
      1,
    ],
  );
}

async function runParentItemRelationship() {
  const saved = graphStory();
  relationalRead(mockClientQuery, saved);

  await repository().mutate(
    saved.id,
    (value) => {
      const items = value.characters?.[0].items ?? [];
      const parentItem = items[0];
      const childItem = items[1];
      if (!parentItem || !childItem) {
        throw new Error('Expected two character items for the relationship');
      }
      childItem.parentItemId = parentItem.id;
      childItem.relationshipType = 'contained';
      childItem.slotKey = 'main';
      return value;
    },
    ownerId,
  );

  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE item_instances SET owner_character_id = $2'),
    ['item-2', null],
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO item_instance_relationships'),
    [saved.id, 'item-1', 'item-2', 'contained', 'main', 1],
  );
}

async function runItemTransferBetweenCharacters() {
  const saved = graphStory();
  const savedCharacters = saved.characters;
  if (!savedCharacters) {
    throw new Error('Expected saved characters');
  }
  savedCharacters.push({ id: 'character-2', name: 'Luc', description: '', items: [] });
  relationalRead(mockClientQuery, saved);

  await repository().mutate(
    saved.id,
    (value) => {
      const source = firstRequired(value.characters, 'source character');
      const destination = firstRequired(value.characters?.slice(1), 'destination character');
      const item = source.items?.shift();
      if (!item) {
        throw new Error('Expected an item to transfer');
      }
      destination.items = [...(destination.items ?? []), item];
      return value;
    },
    ownerId,
  );

  expect(mockClientQuery).not.toHaveBeenCalledWith(
    'DELETE FROM item_instances WHERE id = $1 AND story_id = $2',
    expect.anything(),
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE item_instances SET owner_character_id = $2'),
    ['item-1', 'character-2'],
  );
}

async function runItemTransferToLocation() {
  const saved = graphStory();
  relationalRead(mockClientQuery, saved);

  await repository().mutate(
    saved.id,
    (value) => {
      const character = firstRequired(value.characters, 'source character');
      const location = firstRequired(value.locations, 'destination location');
      const item = character.items?.shift();
      if (!item) {
        throw new Error('Expected an item to transfer');
      }
      location.items = [item];
      return value;
    },
    ownerId,
  );

  expect(mockClientQuery).not.toHaveBeenCalledWith(
    'DELETE FROM item_instances WHERE id = $1 AND story_id = $2',
    expect.anything(),
  );
  expect(mockClientQuery).toHaveBeenCalledWith(
    expect.stringContaining(
      'UPDATE item_instances SET owner_character_id = $2, owner_location_id = $3',
    ),
    ['item-1', null, 'location-1'],
  );
}

async function runMutationRollback() {
  relationalRead(mockClientQuery);
  await expect(
    repository().mutate(
      'story-1',
      () => {
        throw new Error('mutation failed');
      },
      ownerId,
    ),
  ).rejects.toThrow('mutation failed');

  expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK');
  expect(mockRelease).toHaveBeenCalledTimes(1);
}

async function runReaderProgressPersistence() {
  const state = {
    version: 1 as const,
    journeyInteractionIds: ['interaction-1'],
    currentInteractionId: 'interaction-1',
    visitedInteractionIds: ['interaction-1'],
    currentDateTime: '2026-07-27T09:15',
    currentLocationId: null,
    statValues: {},
    ownedItemIds: [],
  };
  mockQuery
    .mockResolvedValueOnce({
      rows: [
        {
          slot_id: 'reader-autosave',
          name: null,
          state,
          created_at: new Date('2026-07-27T09:15:00.000Z'),
          updated_at: new Date('2026-07-27T09:15:00.000Z'),
        },
      ],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await expect(repository().findProgress('story-1', ownerId)).resolves.toEqual({
    id: 'reader-autosave',
    kind: 'reader-autosave',
    state,
    createdAt: '2026-07-27T09:15:00.000Z',
    updatedAt: '2026-07-27T09:15:00.000Z',
  });
  await expect(
    repository().saveProgress('story-1', ownerId, state, '2026-07-27T09:15:00.000Z'),
  ).resolves.toBe(true);
  await repository().deleteProgress('story-1', ownerId);
  expectReaderProgressQueries(state);
}

function expectReaderProgressQueries(state: Parameters<StoriesRepository['saveProgress']>[2]) {
  expect(mockQuery).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining('INSERT INTO story_reader_progress'),
    [
      'story-1',
      ownerId,
      JSON.stringify(state),
      '2026-07-27T09:15:00.000Z',
      'reader-autosave',
      null,
      '2026-07-27T09:15:00.000Z',
    ],
  );
  expect(mockQuery).toHaveBeenLastCalledWith(
    'DELETE FROM story_reader_progress WHERE story_id = $1 AND user_id = $2 AND slot_id = $3',
    ['story-1', ownerId, 'reader-autosave'],
  );
}
