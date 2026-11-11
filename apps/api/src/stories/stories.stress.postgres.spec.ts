import { randomUUID } from 'node:crypto';
import type { Story } from '@paralleax/shared';
import { Pool } from 'pg';
import type { DatabaseConnection } from '../database/database.connection';
import { DatabaseMigrator } from '../database/database.migrator';
import { StoriesRepository } from './stories.repository';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const runStressTests = process.env.RUN_POSTGRES_STRESS_TESTS === 'true';
const describeStress = connectionString && runStressTests ? describe : describe.skip;
const interactionCount = positiveInteger(process.env.STRESS_INTERACTION_COUNT, 1_000);
const summaryStoryCount = positiveInteger(process.env.STORY_SUMMARY_STORY_COUNT, 25);
const summaryInteractionCount = positiveInteger(process.env.STORY_SUMMARY_INTERACTION_COUNT, 1_000);

const pool = new Pool({ connectionString });
const queryCounter = createQueryCounter(pool);
const database: DatabaseConnection = {
  pool: queryCounter.pool,
  async onModuleDestroy() {
    await queryCounter.pool.end();
  },
};
const repository = new StoriesRepository(database);
const ownerId = `stress-user-${randomUUID()}`;

describeStress('StoriesRepository PostgreSQL stress', () => {
  beforeAll(prepareStressDatabase, 30_000);
  afterAll(() => pool.end());

  it(
    `round-trips and mutates a ${interactionCount}-interaction story within the stress budgets`,
    runLargeStoryStress,
    120_000,
  );
  it(
    `lists ${summaryStoryCount} stories with ${summaryInteractionCount} interactions within summary budgets`,
    runStorySummaryStress,
    180_000,
  );
});

async function prepareStressDatabase() {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await new DatabaseMigrator(database).run();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, created_at)
     VALUES ($1, $2, 'stress-only', now())`,
    [ownerId, `${ownerId}@example.test`],
  );
}

async function runLargeStoryStress() {
  const story = largeStory(interactionCount);
  const payloadBytes = Buffer.byteLength(JSON.stringify(story));
  const measurements = await measureStoryOperations(story);
  console.info(
    `POSTGRES_STRESS ${JSON.stringify({
      interactions: interactionCount,
      payloadBytes,
      saveMs: round(measurements.saveMs),
      saveQueryCount: measurements.saveQueryCount,
      loadMs: round(measurements.load.durationMs),
      loadQueryCount: measurements.loadQueryCount,
      mutationMs: round(measurements.mutation.durationMs),
      mutationQueryCount: measurements.mutationQueryCount,
    })}`,
  );
  expectLargeStoryResult(measurements);
}

async function measureStoryOperations(story: Story) {
  queryCounter.reset();
  const saveMs = await measure(() => repository.save(story, ownerId));
  const saveQueryCount = queryCounter.value();

  queryCounter.reset();
  const load = await measureResult(() => repository.find(story.id, ownerId));
  const loadQueryCount = queryCounter.value();

  queryCounter.reset();
  const mutation = await measureResult(() =>
    repository.mutate(
      story.id,
      (current) => {
        const target = current.interactions[current.interactions.length - 1];
        target.position = { x: target.position.x + 25, y: target.position.y + 25 };
        return current;
      },
      ownerId,
    ),
  );
  return {
    saveMs,
    saveQueryCount,
    load,
    loadQueryCount,
    mutation,
    mutationQueryCount: queryCounter.value(),
  };
}

function expectLargeStoryResult(measurements: Awaited<ReturnType<typeof measureStoryOperations>>) {
  expect(measurements.load.result?.interactions).toHaveLength(interactionCount);
  expect(measurements.load.result?.interactions.at(-1)?.triggers[0].inputInteractionIds).toEqual([
    `interaction-${interactionCount - 2}`,
  ]);
  expect(measurements.mutation.result?.interactions.at(-1)?.position).toEqual({
    x: ((interactionCount - 1) % 20) * 260 + 105,
    y: Math.floor((interactionCount - 1) / 20) * 150 + 105,
  });
  expect(measurements.saveMs).toBeLessThan(budget('STRESS_SAVE_BUDGET_MS', 60_000));
  expect(measurements.load.durationMs).toBeLessThan(budget('STRESS_LOAD_BUDGET_MS', 15_000));
  expect(measurements.mutation.durationMs).toBeLessThan(
    budget('STRESS_MUTATION_BUDGET_MS', 20_000),
  );
  expect(measurements.saveQueryCount).toBeLessThan(budget('STRESS_SAVE_QUERY_BUDGET', 200));
  expect(measurements.loadQueryCount).toBeLessThan(budget('STRESS_LOAD_QUERY_BUDGET', 100));
  expect(measurements.mutationQueryCount).toBeLessThan(budget('STRESS_MUTATION_QUERY_BUDGET', 250));
}

async function runStorySummaryStress() {
  await repository.saveMany(
    Array.from({ length: summaryStoryCount }, (_, index) =>
      summaryStressStory(index, summaryInteractionCount),
    ),
    ownerId,
  );
  const measurements = await measureSummaryListings();
  console.info(
    `POSTGRES_STORY_SUMMARY_STRESS ${JSON.stringify(summaryStressMetrics(measurements))}`,
  );
  expectSummaryListingBudgets(measurements);
}

async function measureSummaryListings() {
  queryCounter.reset();
  const authenticatedListing = await measureResult(() =>
    repository.list(ownerId, { page: 1, pageSize: summaryStoryCount }),
  );
  const authenticatedQueryCount = queryCounter.value();
  const authenticatedPayloadBytes = Buffer.byteLength(JSON.stringify(authenticatedListing.result));

  queryCounter.reset();
  const publicListing = await measureResult(() =>
    repository.listPublic({ page: 1, pageSize: summaryStoryCount }),
  );
  return {
    authenticatedListing,
    authenticatedQueryCount,
    authenticatedPayloadBytes,
    publicListing,
    publicQueryCount: queryCounter.value(),
    publicPayloadBytes: Buffer.byteLength(JSON.stringify(publicListing.result)),
  };
}

function summaryStressMetrics(measurements: Awaited<ReturnType<typeof measureSummaryListings>>) {
  return {
    stories: summaryStoryCount,
    interactionsPerStory: summaryInteractionCount,
    totalInteractions: summaryStoryCount * summaryInteractionCount,
    authenticated: {
      payloadBytes: measurements.authenticatedPayloadBytes,
      latencyMs: round(measurements.authenticatedListing.durationMs),
      queryCount: measurements.authenticatedQueryCount,
    },
    public: {
      payloadBytes: measurements.publicPayloadBytes,
      latencyMs: round(measurements.publicListing.durationMs),
      queryCount: measurements.publicQueryCount,
    },
  };
}

function expectSummaryListingBudgets(
  measurements: Awaited<ReturnType<typeof measureSummaryListings>>,
) {
  for (const listing of [measurements.authenticatedListing, measurements.publicListing]) {
    expect(listing.result.items).toHaveLength(summaryStoryCount);
    expect(
      listing.result.items.every((story) => story.interactionCount === summaryInteractionCount),
    ).toBe(true);
    expect(listing.result.items.every((story) => !('interactions' in story))).toBe(true);
    expect(listing.durationMs).toBeLessThanOrEqual(
      budget('STORY_SUMMARY_LATENCY_BUDGET_MS', 5_000),
    );
  }
  expect(measurements.authenticatedQueryCount).toBeLessThanOrEqual(
    budget('STORY_SUMMARY_QUERY_BUDGET', 2),
  );
  expect(measurements.publicQueryCount).toBeLessThanOrEqual(
    budget('STORY_SUMMARY_QUERY_BUDGET', 2),
  );
  expect(measurements.authenticatedPayloadBytes).toBeLessThanOrEqual(
    budget('STORY_SUMMARY_PAYLOAD_BUDGET_BYTES', 32 * 1024),
  );
  expect(measurements.publicPayloadBytes).toBeLessThanOrEqual(
    budget('STORY_SUMMARY_PAYLOAD_BUDGET_BYTES', 32 * 1024),
  );
}

function createQueryCounter(instrumentedPool: Pool) {
  let count = 0;
  const instrument = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(currentTarget, property) {
        const value: unknown = Reflect.get(currentTarget, property);
        if (property === 'query' && typeof value === 'function') {
          return (...args: unknown[]) => {
            count += 1;
            const result: unknown = Reflect.apply(value, currentTarget, args);
            return result;
          };
        }
        if (property === 'connect' && typeof value === 'function') {
          return async (...args: unknown[]) => {
            const client: unknown = await Reflect.apply(value, currentTarget, args);
            if (!isObject(client)) {
              throw new Error('PostgreSQL pool returned an invalid client');
            }
            return instrument(client);
          };
        }
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(value, currentTarget, args);
          return result;
        };
      },
    });

  return {
    pool: instrument(instrumentedPool),
    reset: () => {
      count = 0;
    },
    value: () => count,
  };
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function largeStory(count: number): Story {
  const now = new Date().toISOString();
  return {
    id: `stress-story-${randomUUID()}`,
    title: `Stress story with ${count} interactions`,
    createdAt: now,
    updatedAt: now,
    startDateTime: '2026-08-02T09:00',
    locations: stressLocations(),
    statDefinitions: stressStatDefinitions(),
    itemDefinitions: stressItemDefinitions(),
    characters: stressCharacters(),
    interactions: Array.from({ length: count }, (_, index) => stressInteraction(index)),
  };
}

function stressLocations() {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `location-${index}`,
    name: `Location ${index}`,
    description: `Description for location ${index}.`.repeat(5),
  }));
}

function stressStatDefinitions() {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `stat-definition-${index}`,
    name: `Stat ${index}`,
    changePerHour: index % 2 === 0 ? 0.25 : -0.25,
  }));
}

function stressItemDefinitions() {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `item-definition-${index}`,
    name: `Item ${index}`,
    description: `Reusable item ${index}`,
    stats: [
      {
        id: `item-definition-${index}-stat`,
        statDefinitionId: `stat-definition-${index % 10}`,
        initialValue: index,
      },
    ],
  }));
}

function stressCharacters() {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `character-${index}`,
    name: `Character ${index}`,
    description: `Character description ${index}`,
    isPlayable: index === 0,
    stats: [
      {
        id: `character-stat-${index}`,
        statDefinitionId: `stat-definition-${index % 10}`,
        initialValue: index,
      },
    ],
    items: stressCharacterItems(index),
  }));
}

function stressCharacterItems(characterIndex: number) {
  return Array.from({ length: 5 }, (_, itemIndex) => ({
    id: `item-${characterIndex}-${itemIndex}`,
    itemDefinitionId: `item-definition-${(characterIndex * 5 + itemIndex) % 20}`,
  }));
}

function stressInteraction(index: number) {
  return {
    id: `interaction-${index}`,
    title: `Interaction ${index}`,
    body: `<p>${`Narrative content for interaction ${index}. `.repeat(12)}</p>`,
    position: { x: (index % 20) * 260 + 80, y: Math.floor(index / 20) * 150 + 80 },
    locationId: `location-${index % 20}`,
    characterIds: [`character-${index % 20}`],
    durationMinutes: index % 90,
    triggers: [
      {
        id: `trigger-${index}`,
        inputInteractionIds: index === 0 ? [] : [`interaction-${index - 1}`],
        conditions:
          index > 0 && index % 10 === 0
            ? [{ interactionId: `interaction-${index - 1}`, hasBeenVisited: true }]
            : [],
      },
    ],
  };
}

function summaryStressStory(storyIndex: number, interactionTotal: number): Story {
  const now = new Date().toISOString();
  const interactionPrefix = `summary-${storyIndex}`;
  return {
    id: `summary-stress-story-${randomUUID()}`,
    title: `Summary stress story ${storyIndex}`,
    createdAt: now,
    updatedAt: now,
    startDateTime: '2026-08-02T09:00',
    access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
    interactions: Array.from({ length: interactionTotal }, (_, index) => ({
      id: `${interactionPrefix}-interaction-${index}`,
      title: `Interaction ${index}`,
      body: `<p>${`Narrative content for story ${storyIndex}, interaction ${index}. `.repeat(12)}</p>`,
      position: { x: (index % 20) * 260 + 80, y: Math.floor(index / 20) * 150 + 80 },
      triggers: [
        {
          id: `${interactionPrefix}-trigger-${index}`,
          inputInteractionIds: index === 0 ? [] : [`${interactionPrefix}-interaction-${index - 1}`],
          conditions: [],
        },
      ],
    })),
  };
}

async function measure(operation: () => Promise<unknown>) {
  const start = performance.now();
  await operation();
  return performance.now() - start;
}

async function measureResult<T>(operation: () => Promise<T>) {
  const start = performance.now();
  const result = await operation();
  return { result, durationMs: performance.now() - start };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function budget(name: string, fallback: number) {
  return positiveInteger(process.env[name], fallback);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
