import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  collectNativeStoryPersistentIds,
  getTriggerProbabilityResult,
  projectNativeStory,
  remapNativeStoryContent,
  type NativeStoryContent,
  type NativeStoryIdKind,
  type NativeStoryIdMaps,
  type Story,
} from '@paralleax/shared';
import { Pool } from 'pg';
import { DatabaseMigrator } from '../database/database.migrator';
import {
  insertPostgresTestUsers,
  resetPostgresTestDatabase,
  sharedPostgresTestConnection,
} from '../database/postgres-test-database';
import { NativeStoryImportService } from './application/native-story-import';
import { NATIVE_STORY_IMPORT_PORT } from './application/native-story-import.port';
import { StoryGraphService } from './application/story-graph';
import { StoryMutationService } from './application/story-mutations';
import { sanitizeAndRemapStoryRichText } from './rich-text';
import { StoriesRepository } from './stories.repository';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres =
  connectionString !== undefined && connectionString !== '' ? describe : describe.skip;
const pool = new Pool({ connectionString });
const database = sharedPostgresTestConnection(pool);
const repository = new StoriesRepository(database);
const ownerId = `native-owner-${randomUUID()}`;
const otherId = `native-other-${randomUUID()}`;
let moduleRef: TestingModule;
let service: NativeStoryImportService;

describePostgres('native Story import with PostgreSQL', () => {
  beforeAll(async () => {
    await resetPostgresTestDatabase(pool, new DatabaseMigrator(database));
    await insertPostgresTestUsers(pool, [
      { id: ownerId, email: `${ownerId}@example.test` },
      { id: otherId, email: `${otherId}@example.test` },
    ]);
    moduleRef = await Test.createTestingModule({
      providers: [
        NativeStoryImportService,
        StoryGraphService,
        { provide: NATIVE_STORY_IMPORT_PORT, useValue: repository },
        { provide: StoryMutationService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(NativeStoryImportService);
  }, 30_000);
  afterEach(async () => {
    await pool.query('DELETE FROM stories WHERE creator_user_id = ANY($1::text[])', [
      [ownerId, otherId],
    ]);
  });
  afterAll(async () => {
    await moduleRef.close();
    await pool.end();
  });

  it('round-trips editorial data, references and probability across collisions', runRoundTrip);
  it('rolls back the Story and all children if a persistence constraint fails', runRollback);
  it('imports hundreds of interactions in one request', runLargeImport);
  it('does not write when validation or quota checks fail', runRejectedImport);
});

async function runRoundTrip() {
  const source = sourceStory();
  await repository.save(source, ownerId);
  const loadedSource = await requireStory(source.id, ownerId);
  const native = projectNativeStory(loadedSource);
  const bytes = Buffer.from(JSON.stringify(native));
  expect(service.preview(bytes)).toMatchObject({
    title: source.title,
    interactionCount: 3,
    triggerCount: 3,
  });
  const imported = await service.create(bytes, otherId);
  expect(imported.id).not.toBe(source.id);
  const loadedImport = await requireStory(imported.id, otherId);
  expect(await repository.find(imported.id, ownerId)).toBeUndefined();
  expect(loadedImport.access?.visibility).toBe('private');
  expect(loadedImport.capabilities?.canManage).toBe(true);
  expect(loadedImport.interactions[0].id).not.toBe(loadedSource.interactions[0].id);
  expectEquivalentContent(native.story, projectNativeStory(loadedImport).story);
  const seed = { randomSeed: 'same-seed', step: 3 };
  expect(getTriggerProbabilityResult(loadedImport.interactions[2].triggers[0], seed)).toEqual(
    getTriggerProbabilityResult(loadedSource.interactions[2].triggers[0], seed),
  );
  expect(projectNativeStory(await requireStory(source.id, ownerId))).toEqual(native);
}

async function runRollback() {
  const source = sourceStory();
  await repository.save(source, ownerId);
  const content = projectNativeStory(await requireStory(source.id, ownerId)).story;
  const importedId = randomUUID();
  await expect(
    repository.createNativeStory({
      content,
      storyId: importedId,
      ownerId: otherId,
      prepare: (maps) => {
        const mapped = remapNativeStoryContent(content, maps, sanitizeAndRemapStoryRichText);
        mapped.interactions[0].locationId = 'missing-location';
        return {
          ...mapped,
          id: importedId,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
        };
      },
    }),
  ).rejects.toThrow();
  const result = await pool.query<{ stories: string; interactions: string; locations: string }>(
    `SELECT (SELECT count(*) FROM stories WHERE id = $1) AS stories,
              (SELECT count(*) FROM interactions WHERE story_id = $1) AS interactions,
              (SELECT count(*) FROM locations WHERE story_id = $1) AS locations`,
    [importedId],
  );
  expect(result.rows[0]).toMatchObject({ stories: '0', interactions: '0', locations: '0' });
}

async function runLargeImport() {
  const now = new Date().toISOString();
  const source: Story = {
    id: randomUUID(),
    title: 'Large native Story',
    createdAt: now,
    updatedAt: now,
    interactions: Array.from({ length: 500 }, (_, index) => ({
      id: `large-scene-${index}`,
      title: `Scene ${index}`,
      body: `<p>Scene ${index}</p>`,
      position: { x: index, y: index },
      triggers: [
        {
          id: `large-trigger-${index}`,
          inputInteractionIds: index === 0 ? [] : [`large-scene-${index - 1}`],
          conditionGroups: [{ id: `group-${index}`, conditions: [] }],
        },
      ],
    })),
  };
  await repository.save(source, ownerId);
  const file = projectNativeStory(await requireStory(source.id, ownerId));
  const imported = await service.create(Buffer.from(JSON.stringify(file)), otherId);
  const result = await pool.query<{ total: string }>(
    'SELECT count(*) AS total FROM interactions WHERE story_id = $1',
    [imported.id],
  );
  expect(result.rows[0].total).toBe('500');
  expect(imported.interactionCount).toBe(500);
}

async function runRejectedImport() {
  const source = sourceStory();
  await repository.save(source, ownerId);
  const file = projectNativeStory(await requireStory(source.id, ownerId));
  const before = await pool.query<{ total: string }>('SELECT count(*) AS total FROM stories');
  const originalLimit = process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
  process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = '1';
  try {
    await expect(service.create(Buffer.from(JSON.stringify(file)), otherId)).rejects.toMatchObject({
      code: 'STORY_QUOTA_EXCEEDED',
    });
  } finally {
    if (originalLimit === undefined) {
      delete process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
    } else {
      process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = originalLimit;
    }
  }
  const invalid = structuredClone(file);
  invalid.story.interactions[1].id = invalid.story.interactions[0].id;
  await expect(service.create(Buffer.from(JSON.stringify(invalid)), otherId)).rejects.toMatchObject(
    {
      code: 'DUPLICATE_IDENTIFIER',
    },
  );
  const after = await pool.query<{ total: string }>('SELECT count(*) AS total FROM stories');
  expect(after.rows[0].total).toBe(before.rows[0].total);
}

async function requireStory(id: string, userId: string): Promise<Story> {
  const story = await repository.find(id, userId);
  if (!story) {
    throw new Error('Expected a readable test Story');
  }
  return story;
}

function expectEquivalentContent(source: NativeStoryContent, imported: NativeStoryContent): void {
  const sourceIds = collectNativeStoryPersistentIds(source);
  const importedIds = collectNativeStoryPersistentIds(imported);
  expect(importedIds).toHaveLength(sourceIds.length);
  const maps: Partial<Record<NativeStoryIdKind, Map<string, string>>> = {};
  sourceIds.forEach((entry, index) => {
    const mapped = importedIds[index];
    expect(mapped.kind).toBe(entry.kind);
    const ids = maps[entry.kind] ?? new Map<string, string>();
    ids.set(mapped.id, entry.id);
    maps[entry.kind] = ids;
  });
  const normalize = (content: NativeStoryContent, idMaps: NativeStoryIdMaps) => {
    const result = remapNativeStoryContent(content, idMaps, sanitizeAndRemapStoryRichText);
    for (const interaction of result.interactions) {
      for (const trigger of interaction.triggers) {
        if (trigger.probabilityKey === trigger.id) {
          delete trigger.probabilityKey;
        }
      }
    }
    const normalized: unknown = JSON.parse(JSON.stringify(result));
    return normalized;
  };
  expect(normalize(imported, maps)).toEqual(normalize(source, {}));
}

function sourceStory(): Story {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    title: 'Complex native Story',
    createdAt: now,
    updatedAt: now,
    startDateTime: '2026-11-20T09:00',
    statDefinitions: [
      { id: 'score-def', name: 'Score', valueType: 'number', changePerHour: 1 },
      { id: 'charge-def', name: 'Charge', valueType: 'number' },
    ],
    stats: [{ id: 'score', statDefinitionId: 'score-def', initialValue: 2 }],
    itemDefinitions: sourceItemDefinitions(),
    characters: sourceCharacters(),
    locations: [{ id: 'place', name: 'Place', description: '' }],
    groups: [
      { id: 'group', title: 'Act', interactionIds: ['root', 'branch'] },
      { id: 'subgroup', title: 'End', parentGroupId: 'group', interactionIds: ['ending'] },
    ],
    graphDecorations: [
      {
        id: 'frame',
        kind: 'frame',
        position: { x: 1, y: 2 },
        color: '#112233',
        width: 300,
        height: 150,
      },
    ],
    interactions: sourceInteractions(),
  };
}

function sourceItemDefinitions(): NonNullable<Story['itemDefinitions']> {
  return [
    {
      id: 'item-def',
      name: 'Box',
      description: 'Container',
      stats: [{ id: 'charge', statDefinitionId: 'charge-def', initialValue: 3 }],
    },
  ];
}

function sourceCharacters(): NonNullable<Story['characters']> {
  return [
    {
      id: 'hero',
      name: 'Hero',
      description: '',
      isPlayable: true,
      items: [
        { id: 'box', itemDefinitionId: 'item-def' },
        {
          id: 'child',
          itemDefinitionId: 'item-def',
          parentItemId: 'box',
          relationshipType: 'contained',
        },
      ],
    },
  ];
}

function sourceInteractions(): Story['interactions'] {
  return [
    {
      id: 'root',
      title: 'Start',
      position: { x: 0, y: 0 },
      locationId: 'place',
      characterIds: ['hero'],
      durationMinutes: 20,
      body: '<div data-conditional-text-block="block"><span data-stat-value="charge" data-stat-item="child">Charge</span><span data-interaction-link-target="branch">Go</span></div>',
      conditionalTextBlocks: [
        { id: 'block', conditions: [{ interactionId: 'root', hasBeenVisited: true }] },
      ],
      statEffects: [{ statId: 'score', operation: 'add', expression: '@{score} + 1' }],
      itemEffects: [{ itemDefinitionId: 'item-def', characterId: 'hero', operation: 'obtain' }],
      triggers: [
        {
          id: 'root-trigger',
          inputInteractionIds: [],
          conditionGroups: [{ id: 'root-group', conditions: [] }],
        },
      ],
    },
    {
      id: 'branch',
      title: 'Branch',
      body: '<p>Branch</p>',
      position: { x: 1, y: 1 },
      triggers: [
        {
          id: 'branch-trigger',
          inputInteractionIds: ['root'],
          conditionGroups: [{ id: 'branch-group', conditions: [] }],
        },
      ],
    },
    sourceEnding(),
  ];
}

function sourceEnding(): Story['interactions'][number] {
  return {
    id: 'ending',
    title: 'End',
    body: '<p>End</p>',
    position: { x: 2, y: 2 },
    triggers: [
      {
        id: 'end-trigger',
        inputInteractionIds: ['root', 'branch'],
        appearanceProbability: 43,
        timerSeconds: 12,
        conditionGroups: [
          {
            id: 'end-group',
            conditions: [
              { statId: 'score', operator: 'gte', expression: '@{score} + 1' },
              {
                temporal: {
                  weekdays: ['friday'],
                  timeSlots: [{ startTime: '09:00', endTime: '17:00' }],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
