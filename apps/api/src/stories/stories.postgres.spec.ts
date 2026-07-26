import { randomUUID } from 'node:crypto';
import type { Story } from '@paralleax/shared';
import { Pool } from 'pg';
import type { DatabaseConnection } from '../database/database.connection';
import { DatabaseMigrator } from '../database/database.migrator';
import { StoriesRepository } from './stories.repository';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('StoriesRepository PostgreSQL integration', () => {
  const ownerId = `postgres-user-${randomUUID()}`;
  const pool = new Pool({ connectionString });
  const database = { pool } as DatabaseConnection;
  const migrator = new DatabaseMigrator(database);
  const repository = new StoriesRepository(database, migrator);
  const storyIds: string[] = [];

  beforeAll(async () => {
    await waitForPostgres(pool);
    await migrator.run();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ($1, $2, 'test-only', now())`,
      [ownerId, `${ownerId}@example.test`],
    );
  });

  afterEach(async () => {
    await Promise.all(storyIds.splice(0).map((id) => repository.delete(id, ownerId)));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
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
      locations: [{ id: 'location-1', name: 'Harbor', description: 'A quiet harbor.' }],
      characters: [
        {
          id: 'character-1',
          name: 'Mira',
          description: 'An investigator.',
          stats: [{ id: 'stat-1', name: 'Trust', initialValue: 2 }],
        },
      ],
      interactions: [
        {
          id: 'interaction-1',
          title: 'Original title',
          body: 'Original content',
          position: { x: 80, y: 120 },
          locationId: 'location-1',
          characterIds: ['character-1'],
          statEffects: [{ statId: 'stat-1', operation: 'add', value: 1 }],
          triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
        },
        {
          id: 'interaction-2',
          title: 'Next scene',
          body: 'A linked scene',
          position: { x: 320, y: 120 },
          triggers: [
            {
              id: 'trigger-2',
              inputInteractionIds: ['interaction-1'],
              conditions: [
                { interactionId: 'interaction-1', hasBeenVisited: true },
                { locationId: 'location-1', isCurrentLocation: true },
                { characterId: 'character-1', isPresent: true },
                { statId: 'stat-1', operator: 'gte', value: 3 },
              ],
            },
          ],
        },
      ],
    };
  }

  it('persists an interaction move across repository instances', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);
    await repository.mutate(
      story.id,
      (current) => {
        current.interactions[0].position = { x: 420, y: 360 };
        current.updatedAt = new Date().toISOString();
        return current;
      },
      ownerId,
    );

    const reloadedRepository = new StoriesRepository(database, migrator);
    const reloaded = await reloadedRepository.find(story.id, ownerId);
    expect(reloaded?.interactions[0]).toMatchObject({
      title: 'Original title',
      body: 'Original content',
      position: { x: 420, y: 360 },
      locationId: 'location-1',
      characterIds: ['character-1'],
      statEffects: [{ statId: 'stat-1', operation: 'add', value: 1 }],
    });
    expect(reloaded?.locations).toEqual([
      { id: 'location-1', name: 'Harbor', description: 'A quiet harbor.' },
    ]);
    expect(reloaded?.interactions[1].triggers[0]).toEqual({
      id: 'trigger-2',
      inputInteractionIds: ['interaction-1'],
      conditions: [
        { interactionId: 'interaction-1', hasBeenVisited: true },
        { locationId: 'location-1', isCurrentLocation: true },
        { characterId: 'character-1', isPresent: true },
        { statId: 'stat-1', operator: 'gte', value: 3 },
      ],
    });
  });

  it('merges concurrent field-level mutations without losing fields', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);

    await Promise.all([
      repository.mutate(
        story.id,
        async (current) => {
          current.interactions[0].title = 'Concurrent title';
          await new Promise((resolve) => setTimeout(resolve, 75));
          return current;
        },
        ownerId,
      ),
      repository.mutate(
        story.id,
        (current) => {
          current.interactions[0].body = 'Concurrent content';
          return current;
        },
        ownerId,
      ),
    ]);

    const reloaded = await repository.find(story.id, ownerId);
    expect(reloaded?.interactions[0]).toMatchObject({
      title: 'Concurrent title',
      body: 'Concurrent content',
    });
  });

  it('stores the story graph in relational tables', async () => {
    const story = persistedStory();
    await repository.save(story, ownerId);

    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM interactions WHERE story_id = $1) AS interactions,
         (SELECT count(*)::int FROM locations WHERE story_id = $1) AS locations,
         (SELECT count(*)::int FROM characters WHERE story_id = $1) AS characters,
         (SELECT count(*)::int FROM interaction_characters WHERE story_id = $1)
           AS interaction_characters,
         (SELECT count(*)::int FROM character_stats WHERE story_id = $1)
           AS character_stats,
         (SELECT count(*)::int FROM interaction_stat_effects WHERE story_id = $1)
           AS interaction_stat_effects,
         (SELECT count(*)::int FROM triggers
          JOIN interactions ON interactions.id = triggers.output_interaction_id
          WHERE interactions.story_id = $1) AS triggers,
         (SELECT count(*)::int FROM trigger_inputs
          JOIN triggers ON triggers.id = trigger_inputs.trigger_id
          JOIN interactions ON interactions.id = triggers.output_interaction_id
          WHERE interactions.story_id = $1) AS inputs,
         (SELECT coalesce(sum(jsonb_array_length(conditions)), 0)::int FROM triggers
          WHERE story_id = $1) AS conditions`,
      [story.id],
    );

    expect(result.rows[0]).toEqual({
      interactions: 2,
      locations: 1,
      characters: 1,
      interaction_characters: 1,
      character_stats: 1,
      interaction_stat_effects: 1,
      triggers: 2,
      inputs: 1,
      conditions: 4,
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
