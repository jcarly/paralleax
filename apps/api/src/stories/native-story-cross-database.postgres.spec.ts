import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  getAvailableInteractions,
  getJourneyStatValues,
  projectNativeStory,
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
import { StoriesRepository } from './stories.repository';

const sourceUrl = process.env.POSTGRES_TEST_DATABASE_URL;
const targetUrl = process.env.POSTGRES_TEST_DATABASE_URL_B;
const describeTwoDatabases =
  sourceUrl !== undefined && sourceUrl !== '' && targetUrl !== undefined && targetUrl !== ''
    ? describe
    : describe.skip;
const sourcePool = new Pool({ connectionString: sourceUrl });
const targetPool = new Pool({ connectionString: targetUrl });
const sourceDb = sharedPostgresTestConnection(sourcePool);
const targetDb = sharedPostgresTestConnection(targetPool);
const sourceRepository = new StoriesRepository(sourceDb);
const targetRepository = new StoriesRepository(targetDb);
const sourceOwner = `source-${randomUUID()}`;
const targetOwner = `target-${randomUUID()}`;
let moduleRef: TestingModule;
let importer: NativeStoryImportService;

describeTwoDatabases('native Story transfer between distinct databases', () => {
  beforeAll(async () => {
    const sourceName = await sourcePool.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    const targetName = await targetPool.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (sourceName.rows[0].name === targetName.rows[0].name) {
      throw new Error('Test databases must be distinct');
    }
    await resetPostgresTestDatabase(sourcePool, new DatabaseMigrator(sourceDb));
    await resetPostgresTestDatabase(targetPool, new DatabaseMigrator(targetDb));
    await insertPostgresTestUsers(sourcePool, [
      { id: sourceOwner, email: `${sourceOwner}@example.test` },
    ]);
    await insertPostgresTestUsers(targetPool, [
      { id: targetOwner, email: `${targetOwner}@example.test` },
    ]);
    moduleRef = await Test.createTestingModule({
      providers: [
        NativeStoryImportService,
        StoryGraphService,
        { provide: NATIVE_STORY_IMPORT_PORT, useValue: targetRepository },
        { provide: StoryMutationService, useValue: {} },
      ],
    }).compile();
    importer = moduleRef.get(NativeStoryImportService);
  }, 30_000);
  afterAll(async () => {
    await moduleRef.close();
    await sourcePool.end();
    await targetPool.end();
  });
  it(
    'keeps editorial data, IDs and narrative results across environments',
    runCrossDatabaseTransfer,
  );
});

async function runCrossDatabaseTransfer() {
  const source = fixture();
  await sourceRepository.save(source, sourceOwner);
  const original = await load(sourceRepository, source.id, sourceOwner);
  const exported = projectNativeStory(original);
  const created = await importer.create(Buffer.from(JSON.stringify(exported)), targetOwner);
  const imported = await load(targetRepository, created.id, targetOwner);
  expect(imported.id).not.toBe(original.id);
  expect(projectNativeStory(imported)).toEqual(exported);
  const journey = ['root'];
  const sourceValues = getJourneyStatValues(original, journey);
  const targetValues = getJourneyStatValues(imported, journey);
  expect(sourceValues).toEqual({ score: 3 });
  expect(targetValues).toEqual(sourceValues);
  expect(available(imported, journey, targetValues)).toEqual(
    available(original, journey, sourceValues),
  );
  expect(imported.access?.visibility).toBe('private');
  expect(imported.capabilities?.canManage).toBe(true);
}

function available(
  story: Story,
  journey: string[],
  values: Record<string, number | boolean | string>,
) {
  return getAvailableInteractions(
    story,
    'root',
    journey,
    null,
    [],
    values,
    undefined,
    [],
    {},
    {
      randomSeed: 'same-initial-seed',
      step: 1,
    },
  ).map(({ id, title }) => ({ id, title }));
}

async function load(
  repository: StoriesRepository,
  storyId: string,
  userId: string,
): Promise<Story> {
  const story = await repository.find(storyId, userId);
  if (!story) {
    throw new Error('Expected a readable Story');
  }
  return story;
}

function fixture(): Story {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: 'Cross environment',
    createdAt: now,
    updatedAt: now,
    startDateTime: '2026-11-20T09:00',
    statDefinitions: [{ id: 'score-definition', name: 'Score', valueType: 'number' }],
    stats: [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 2 }],
    interactions: [
      {
        id: 'root',
        title: 'Start',
        body: '<p>Start</p>',
        position: { x: 0, y: 0 },
        statEffects: [{ statId: 'score', operation: 'add', value: 1 }],
        triggers: [
          {
            id: 'root-trigger',
            inputInteractionIds: [],
            conditionGroups: [{ id: 'root-group', conditions: [] }],
          },
        ],
      },
      {
        id: 'next',
        title: 'Next',
        body: '<p>Next</p>',
        position: { x: 1, y: 1 },
        triggers: [
          {
            id: 'next-trigger',
            inputInteractionIds: ['root'],
            appearanceProbability: 50,
            conditionGroups: [
              { id: 'next-group', conditions: [{ statId: 'score', operator: 'gte', value: 3 }] },
            ],
          },
        ],
      },
    ],
  };
}
