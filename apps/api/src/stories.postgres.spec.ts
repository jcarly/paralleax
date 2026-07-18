import { randomUUID } from 'node:crypto';
import type { Story } from '@paralleax/shared';
import { Pool } from 'pg';
import type { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';
import { StoriesRepository } from './stories.repository';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('StoriesRepository PostgreSQL integration', () => {
  const pool = new Pool({ connectionString });
  const database = { pool } as DatabaseConnection;
  const migrator = new DatabaseMigrator(database);
  const repository = new StoriesRepository(database, migrator);
  const storyIds: string[] = [];

  beforeAll(async () => {
    await waitForPostgres(pool);
    await migrator.run();
  });

  afterEach(async () => {
    await Promise.all(storyIds.splice(0).map((id) => repository.delete(id)));
  });

  afterAll(async () => {
    await pool.end();
  });

  function persistedStory(): Story {
    const now = new Date().toISOString();
    const id = `postgres-test-${randomUUID()}`;
    storyIds.push(id);
    return {
      id,
      title: 'PostgreSQL round trip',
      createdAt: now,
      updatedAt: now,
      interactions: [
        {
          id: 'interaction-1',
          title: 'Original title',
          body: 'Original content',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
        },
      ],
    };
  }

  it('persists an interaction move across repository instances', async () => {
    const story = persistedStory();
    await repository.save(story);
    await repository.mutate(story.id, (current) => {
      current.interactions[0].position = { x: 420, y: 360 };
      current.updatedAt = new Date().toISOString();
      return current;
    });

    const reloadedRepository = new StoriesRepository(database, migrator);
    const reloaded = await reloadedRepository.find(story.id);
    expect(reloaded?.interactions[0]).toMatchObject({
      title: 'Original title',
      body: 'Original content',
      position: { x: 420, y: 360 },
    });
  });

  it('serializes concurrent row mutations without losing fields', async () => {
    const story = persistedStory();
    await repository.save(story);

    await Promise.all([
      repository.mutate(story.id, async (current) => {
        current.interactions[0].title = 'Concurrent title';
        await new Promise((resolve) => setTimeout(resolve, 75));
        return current;
      }),
      repository.mutate(story.id, (current) => {
        current.interactions[0].body = 'Concurrent content';
        return current;
      }),
    ]);

    const reloaded = await repository.find(story.id);
    expect(reloaded?.interactions[0]).toMatchObject({
      title: 'Concurrent title',
      body: 'Concurrent content',
    });
  });
});

async function waitForPostgres(pool: Pool) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}
