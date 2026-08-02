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
    // Migration scenarios intentionally construct partial historical schemas.
    // Restore a current schema so another PostgreSQL suite can safely reuse the
    // dedicated test database regardless of Jest's file execution order.
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await new DatabaseMigrator({ pool } as DatabaseConnection).run();
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

  it('moves existing character items and exact effects to item instances without changing ids', async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');

    const itemInstancesMigrationIndex = databaseMigrations.findIndex(
      ({ id }) => id === '202608020021_item_instances',
    );
    for (const migration of databaseMigrations.slice(0, itemInstancesMigrationIndex)) {
      await pool.query(migration.sql);
    }

    await pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ('item-owner', 'items@paralleax.invalid', 'disabled', now())`,
    );
    await pool.query(
      `INSERT INTO stories
       (id, revision, title, start_date_time, created_at, updated_at, creator_user_id)
       VALUES ('item-story', 1, 'Items', '2000-01-03T08:00', now(), now(), 'item-owner')`,
    );
    await pool.query(
      `INSERT INTO characters
       (id, story_id, name, description, image_url, is_playable, sort_order)
       VALUES ('character-1', 'item-story', 'Camille', '', '', true, 0)`,
    );
    await pool.query(
      `INSERT INTO locations
       (id, story_id, name, description, image_url, sort_order)
       VALUES ('park', 'item-story', 'Park', '', '', 0)`,
    );
    await pool.query(
      `INSERT INTO item_definitions
       (id, story_id, name, description, image_url, stats, sort_order)
       VALUES ('backpack', 'item-story', 'Backpack', '', '', '[]'::jsonb, 0)`,
    );
    await pool.query(
      `INSERT INTO character_items
       (id, story_id, character_id, item_definition_id, sort_order)
       VALUES ('backpack-1', 'item-story', 'character-1', 'backpack', 0)`,
    );
    await pool.query(
      `INSERT INTO interactions
       (id, story_id, title, body, position_x, position_y, location_id,
        duration_minutes, item_stat_effects, sort_order)
       VALUES ('lose-bag', 'item-story', 'Lose bag', '', 0, 0, NULL, 0, '[]'::jsonb, 0)`,
    );
    await pool.query(
      `INSERT INTO interaction_item_effects
       (story_id, interaction_id, item_id, item_definition_id, character_id, operation, sort_order)
       VALUES ('item-story', 'lose-bag', 'backpack-1', NULL, 'character-1', 'lose', 0)`,
    );

    const migration = databaseMigrations[itemInstancesMigrationIndex];
    await pool.query(migration.sql);

    await expect(
      pool.query(
        `SELECT id, story_id, item_definition_id, owner_character_id,
                owner_location_id, quantity, sort_order
         FROM item_instances WHERE id = 'backpack-1'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          id: 'backpack-1',
          story_id: 'item-story',
          item_definition_id: 'backpack',
          owner_character_id: 'character-1',
          owner_location_id: null,
          quantity: 1,
          sort_order: 0,
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(
        `INSERT INTO item_instances
         (id, story_id, item_definition_id, owner_location_id, sort_order)
         VALUES ('park-bag', 'item-story', 'backpack', 'park', 1)
         RETURNING owner_location_id`,
      ),
    ).resolves.toMatchObject({ rows: [{ owner_location_id: 'park' }], rowCount: 1 });

    await pool.query(`DELETE FROM item_instances WHERE id = 'backpack-1'`);
    await expect(
      pool.query(`SELECT item_id FROM interaction_item_effects WHERE item_id = 'backpack-1'`),
    ).resolves.toMatchObject({ rows: [], rowCount: 0 });
    await expect(
      pool.query(`SELECT to_regclass('public.character_items_legacy') AS legacy_table`),
    ).resolves.toMatchObject({
      rows: [{ legacy_table: 'character_items_legacy' }],
      rowCount: 1,
    });
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
