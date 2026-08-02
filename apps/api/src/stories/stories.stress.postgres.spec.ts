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

describeStress('StoriesRepository PostgreSQL stress', () => {
  const pool = new Pool({ connectionString });
  const database = { pool } as DatabaseConnection;
  const repository = new StoriesRepository(database);
  const ownerId = `stress-user-${randomUUID()}`;

  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await new DatabaseMigrator(database).run();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ($1, $2, 'stress-only', now())`,
      [ownerId, `${ownerId}@example.test`],
    );
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  it(`round-trips and mutates a ${interactionCount}-interaction story within the stress budgets`, async () => {
    const story = largeStory(interactionCount);
    const payloadBytes = Buffer.byteLength(JSON.stringify(story));

    const saveMs = await measure(() => repository.save(story, ownerId));
    const load = await measureResult(() => repository.find(story.id, ownerId));
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

    expect(load.result?.interactions).toHaveLength(interactionCount);
    expect(load.result?.interactions.at(-1)?.triggers[0].inputInteractionIds).toEqual([
      `interaction-${interactionCount - 2}`,
    ]);
    expect(mutation.result?.interactions.at(-1)?.position).toEqual({
      x: ((interactionCount - 1) % 20) * 260 + 105,
      y: Math.floor((interactionCount - 1) / 20) * 150 + 105,
    });

    const measurements = {
      interactions: interactionCount,
      payloadBytes,
      saveMs: round(saveMs),
      loadMs: round(load.durationMs),
      mutationMs: round(mutation.durationMs),
    };
    console.info(`POSTGRES_STRESS ${JSON.stringify(measurements)}`);

    expect(saveMs).toBeLessThan(budget('STRESS_SAVE_BUDGET_MS', 60_000));
    expect(load.durationMs).toBeLessThan(budget('STRESS_LOAD_BUDGET_MS', 15_000));
    expect(mutation.durationMs).toBeLessThan(budget('STRESS_MUTATION_BUDGET_MS', 20_000));
  }, 120_000);
});

function largeStory(count: number): Story {
  const now = new Date().toISOString();
  return {
    id: `stress-story-${randomUUID()}`,
    title: `Stress story with ${count} interactions`,
    createdAt: now,
    updatedAt: now,
    startDateTime: '2026-08-02T09:00',
    locations: Array.from({ length: 20 }, (_, index) => ({
      id: `location-${index}`,
      name: `Location ${index}`,
      description: `Description for location ${index}.`.repeat(5),
    })),
    statDefinitions: Array.from({ length: 10 }, (_, index) => ({
      id: `stat-definition-${index}`,
      name: `Stat ${index}`,
      changePerHour: index % 2 === 0 ? 0.25 : -0.25,
    })),
    itemDefinitions: Array.from({ length: 20 }, (_, index) => ({
      id: `item-definition-${index}`,
      name: `Item ${index}`,
      description: `Reusable item ${index}`,
      stats: [{ statDefinitionId: `stat-definition-${index % 10}`, initialValue: index }],
    })),
    characters: Array.from({ length: 20 }, (_, index) => ({
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
      items: Array.from({ length: 5 }, (_, itemIndex) => ({
        id: `item-${index}-${itemIndex}`,
        itemDefinitionId: `item-definition-${(index * 5 + itemIndex) % 20}`,
      })),
    })),
    interactions: Array.from({ length: count }, (_, index) => ({
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
