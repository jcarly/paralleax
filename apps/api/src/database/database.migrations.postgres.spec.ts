import { Pool } from 'pg';
import type { DatabaseConnection } from './database.connection';
import { databaseMigrations } from './database.migrations';
import { DatabaseMigrator } from './database.migrator';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('Database migrations PostgreSQL upgrade', () => {
  const pool = new Pool({ connectionString });

  beforeAll(async () => {
    await waitForPostgres(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('preserves a legacy JSON story, graph, conditions, and owner', async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query(`
      CREATE TABLE schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of databaseMigrations.slice(0, 4)) {
      await pool.query(migration.sql);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
    }

    const createdAt = '2026-07-01T08:00:00.000Z';
    await pool.query(
      `INSERT INTO stories (id, data, created_at, updated_at, creator_user_id)
       VALUES ($1, $2::jsonb, $3, $3, 'migration-user')`,
      [
        'legacy-story',
        JSON.stringify({
          id: 'legacy-story',
          title: 'Preserved legacy story',
          interactions: [
            {
              id: 'legacy-root',
              title: 'Root',
              body: 'Legacy root body',
              position: { x: 80, y: 120 },
              triggers: [{ id: 'legacy-root-trigger', inputInteractionIds: [], conditions: [] }],
            },
            {
              id: 'legacy-child',
              title: 'Child',
              body: 'Legacy child body',
              position: { x: 80, y: 252 },
              triggers: [
                {
                  id: 'legacy-child-trigger',
                  inputInteractionIds: ['legacy-root', 'legacy-root'],
                  conditions: [{ interactionId: 'legacy-root', hasBeenVisited: true }],
                },
              ],
            },
          ],
        }),
        createdAt,
      ],
    );

    await new DatabaseMigrator({ pool } as DatabaseConnection).run();

    await expect(
      pool.query(
        `SELECT title, revision, creator_user_id, start_date_time
         FROM stories
         WHERE id = 'legacy-story'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          title: 'Preserved legacy story',
          revision: 1,
          creator_user_id: 'migration-user',
          start_date_time: '2000-01-03T08:00',
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(
        `SELECT id, title, body, position_x, position_y, duration_minutes
         FROM interactions
         WHERE story_id = 'legacy-story'
         ORDER BY sort_order`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          id: 'legacy-root',
          title: 'Root',
          body: 'Legacy root body',
          position_x: 80,
          position_y: 120,
          duration_minutes: 0,
        },
        {
          id: 'legacy-child',
          title: 'Child',
          body: 'Legacy child body',
          position_x: 80,
          position_y: 252,
          duration_minutes: 0,
        },
      ],
      rowCount: 2,
    });
    await expect(
      pool.query(
        `SELECT trigger.conditions, input.input_interaction_id
         FROM triggers AS trigger
         JOIN trigger_inputs AS input
           ON input.story_id = trigger.story_id AND input.trigger_id = trigger.id
         WHERE trigger.id = 'legacy-child-trigger'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          conditions: [{ interactionId: 'legacy-root', hasBeenVisited: true }],
          input_interaction_id: 'legacy-root',
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(`SELECT id FROM users WHERE id = 'migration-user'`),
    ).resolves.toMatchObject({ rowCount: 1 });
  }, 30_000);
});

async function waitForPostgres(pool: Pool) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}
