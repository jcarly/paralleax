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
  }, 60_000);

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
        `SELECT trigger.conditions, trigger.position_x, trigger.position_y,
                input.input_interaction_id
         FROM triggers AS trigger
         JOIN trigger_inputs AS input
           ON input.story_id = trigger.story_id AND input.trigger_id = trigger.id
         WHERE trigger.id = 'legacy-child-trigger'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          conditions: [{ interactionId: 'legacy-root', hasBeenVisited: true }],
          position_x: null,
          position_y: null,
          input_interaction_id: 'legacy-root',
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(`SELECT id FROM users WHERE id = 'migration-user'`),
    ).resolves.toMatchObject({ rowCount: 1 });
  }, 30_000);

  it('migrates removed comment policies and enforces the editor default', async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');

    const readerCommentsMigrationIndex = databaseMigrations.findIndex(
      ({ id }) => id === '202608160030_reader_comments',
    );
    for (const migration of databaseMigrations.slice(0, readerCommentsMigrationIndex)) {
      await pool.query(migration.sql);
    }

    await pool.query(`
      INSERT INTO users (id, email, password_hash, created_at)
      VALUES ('comments-owner', 'comments@paralleax.invalid', 'disabled', now())
    `);
    await pool.query(`
      INSERT INTO stories
        (id, revision, title, start_date_time, created_at, updated_at, creator_user_id,
         visibility, edit_policy, comment_policy)
      VALUES
        ('comments-disabled', 1, 'Disabled', '2000-01-03T08:00', now(), now(),
         'comments-owner', 'private', 'owner', 'disabled'),
        ('comments-authenticated', 1, 'Authenticated', '2000-01-03T08:00', now(), now(),
         'comments-owner', 'private', 'owner', 'authenticated'),
        ('comments-editors', 1, 'Editors', '2000-01-03T08:00', now(), now(),
         'comments-owner', 'private', 'owner', 'editors'),
        ('comments-readers', 1, 'Readers', '2000-01-03T08:00', now(), now(),
         'comments-owner', 'private', 'owner', 'readers')
    `);

    await pool.query(databaseMigrations[readerCommentsMigrationIndex].sql);

    await expect(
      pool.query(`SELECT id, comment_policy FROM stories ORDER BY id`),
    ).resolves.toMatchObject({
      rows: [
        { id: 'comments-authenticated', comment_policy: 'readers' },
        { id: 'comments-disabled', comment_policy: 'editors' },
        { id: 'comments-editors', comment_policy: 'editors' },
        { id: 'comments-readers', comment_policy: 'readers' },
      ],
    });
    await pool.query(`
      INSERT INTO stories
        (id, revision, title, start_date_time, created_at, updated_at, creator_user_id)
      VALUES ('comments-default', 1, 'Default', '2000-01-03T08:00', now(), now(),
        'comments-owner')
    `);
    await expect(
      pool.query(`SELECT comment_policy FROM stories WHERE id = 'comments-default'`),
    ).resolves.toMatchObject({ rows: [{ comment_policy: 'editors' }] });
    await expect(
      pool.query(`UPDATE stories SET comment_policy = 'disabled' WHERE id = 'comments-default'`),
    ).rejects.toThrow();
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

  it('removes location item trees while preserving character item trees and valid references', async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');

    const removalMigrationIndex = databaseMigrations.findIndex(
      ({ id }) => id === '202608090023_remove_location_item_roots',
    );
    for (const migration of databaseMigrations.slice(0, removalMigrationIndex)) {
      await pool.query(migration.sql);
    }

    await pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ('tree-owner', 'trees@paralleax.invalid', 'disabled', now())`,
    );
    await pool.query(
      `INSERT INTO stories
       (id, revision, title, start_date_time, created_at, updated_at, creator_user_id)
       VALUES ('tree-story', 1, 'Item trees', '2000-01-03T08:00', now(), now(), 'tree-owner')`,
    );
    await pool.query(
      `INSERT INTO characters
       (id, story_id, name, description, image_url, is_playable, sort_order)
       VALUES ('character-1', 'tree-story', 'Camille', '', '', true, 0)`,
    );
    await pool.query(
      `INSERT INTO locations
       (id, story_id, name, description, image_url, sort_order)
       VALUES ('park', 'tree-story', 'Park', '', '', 0)`,
    );
    await pool.query(
      `INSERT INTO item_definitions
       (id, story_id, name, description, image_url, stats, sort_order)
       VALUES ('bag', 'tree-story', 'Bag', '', '', '[]'::jsonb, 0)`,
    );
    await pool.query(
      `INSERT INTO interactions
       (id, story_id, title, body, position_x, position_y, location_id,
        duration_minutes, item_stat_effects, sort_order)
       VALUES (
         'inspect-items', 'tree-story', 'Inspect items', '', 0, 0, NULL, 0,
         '[
           {"itemId":"character-child","statDefinitionId":"condition","operation":"add","value":1},
           {"itemId":"location-child","statDefinitionId":"condition","operation":"add","value":1}
         ]'::jsonb,
         0
       )`,
    );
    await pool.query(
      `INSERT INTO item_instances
       (id, story_id, item_definition_id, owner_character_id, owner_location_id, sort_order)
       VALUES
         ('character-root', 'tree-story', 'bag', 'character-1', NULL, 0),
         ('character-child', 'tree-story', 'bag', NULL, NULL, 1),
         ('location-root', 'tree-story', 'bag', NULL, 'park', 2),
         ('location-child', 'tree-story', 'bag', NULL, NULL, 3),
         ('location-grandchild', 'tree-story', 'bag', NULL, NULL, 4)`,
    );
    await pool.query(
      `INSERT INTO item_instance_relationships
       (story_id, parent_item_id, child_item_id, relationship_type, sort_order)
       VALUES
         ('tree-story', 'character-root', 'character-child', 'contained', 0),
         ('tree-story', 'location-root', 'location-child', 'contained', 0),
         ('tree-story', 'location-child', 'location-grandchild', 'contained', 0)`,
    );
    await pool.query(
      `INSERT INTO interaction_item_effects
       (story_id, interaction_id, item_id, item_definition_id, character_id, operation, sort_order)
       VALUES
         ('tree-story', 'inspect-items', 'character-child', NULL, 'character-1', 'lose', 0),
         ('tree-story', 'inspect-items', 'location-child', NULL, 'character-1', 'lose', 1)`,
    );
    await pool.query(
      `INSERT INTO story_reader_progress (user_id, story_id, state, updated_at)
       VALUES (
         'tree-owner',
         'tree-story',
         '{
           "version":1,
           "journeyInteractionIds":[],
           "currentInteractionId":null,
           "visitedInteractionIds":[],
           "currentDateTime":"2000-01-03T08:00",
           "currentLocationId":null,
           "statValues":{},
           "ownedItemIds":["character-child","location-child"],
           "itemStatValues":{
             "character-child":{"condition":1},
             "location-child":{"condition":2}
           }
         }'::jsonb,
         now()
       )`,
    );

    await pool.query(databaseMigrations[removalMigrationIndex].sql);

    await expect(
      pool.query(`SELECT id FROM item_instances WHERE story_id = 'tree-story' ORDER BY id`),
    ).resolves.toMatchObject({
      rows: [{ id: 'character-child' }, { id: 'character-root' }],
      rowCount: 2,
    });
    await expect(
      pool.query(
        `SELECT item_id FROM interaction_item_effects
         WHERE story_id = 'tree-story' ORDER BY item_id`,
      ),
    ).resolves.toMatchObject({ rows: [{ item_id: 'character-child' }], rowCount: 1 });
    await expect(
      pool.query(
        `SELECT item_stat_effects FROM interactions
         WHERE story_id = 'tree-story' AND id = 'inspect-items'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          item_stat_effects: [
            {
              itemId: 'character-child',
              statDefinitionId: 'condition',
              operation: 'add',
              value: 1,
            },
          ],
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(
        `SELECT state->'ownedItemIds' AS owned_item_ids,
                state->'itemStatValues' AS item_stat_values
         FROM story_reader_progress
         WHERE story_id = 'tree-story' AND user_id = 'tree-owner'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          owned_item_ids: ['character-child'],
          item_stat_values: { 'character-child': { condition: 1 } },
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'item_instances'
           AND column_name = 'owner_location_id'`,
      ),
    ).resolves.toMatchObject({ rows: [], rowCount: 0 });
    await expect(
      pool.query(
        `INSERT INTO item_instance_relationships
         (story_id, parent_item_id, child_item_id, relationship_type, sort_order)
         VALUES ('tree-story', 'character-child', 'character-root', 'contained', 1)`,
      ),
    ).rejects.toThrow(/root owner/i);
    await expect(
      pool.query(
        `INSERT INTO item_instances
         (id, story_id, item_definition_id, owner_character_id, sort_order)
         VALUES ('orphan', 'tree-story', 'bag', NULL, 2)`,
      ),
    ).rejects.toThrow(/exactly one character or parent item/i);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO item_instances
         (id, story_id, item_definition_id, owner_character_id, sort_order)
         VALUES ('nested-after-migration', 'tree-story', 'bag', NULL, 2)`,
      );
      await client.query(
        `INSERT INTO item_instance_relationships
         (story_id, parent_item_id, child_item_id, relationship_type, sort_order)
         VALUES ('tree-story', 'character-root', 'nested-after-migration', 'contained', 1)`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await expect(
      pool.query(
        `SELECT owner_character_id
         FROM item_instances
         WHERE story_id = 'tree-story' AND id = 'nested-after-migration'`,
      ),
    ).resolves.toMatchObject({ rows: [{ owner_character_id: null }], rowCount: 1 });
  }, 30_000);

  it('restores constrained location roots in a forward migration', async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');

    for (const migration of databaseMigrations) await pool.query(migration.sql);

    await pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ('restored-owner', 'restored@paralleax.invalid', 'disabled', now())`,
    );
    await pool.query(
      `INSERT INTO stories
       (id, revision, title, start_date_time, created_at, updated_at, creator_user_id)
       VALUES ('restored-story', 1, 'Restored roots', '2000-01-03T08:00', now(), now(), 'restored-owner')`,
    );
    await pool.query(
      `INSERT INTO locations
       (id, story_id, name, description, image_url, sort_order)
       VALUES ('home', 'restored-story', 'Home', '', '', 0)`,
    );
    await pool.query(
      `INSERT INTO item_definitions
       (id, story_id, name, description, image_url, stats, sort_order)
       VALUES ('supply', 'restored-story', 'Supply', '', '', '[]'::jsonb, 0)`,
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO item_instances
         (id, story_id, item_definition_id, owner_location_id, sort_order)
         VALUES ('cabinet', 'restored-story', 'supply', 'home', 0),
                ('nested-supply', 'restored-story', 'supply', NULL, 1)`,
      );
      await client.query(
        `INSERT INTO item_instance_relationships
         (story_id, parent_item_id, child_item_id, relationship_type, sort_order)
         VALUES ('restored-story', 'cabinet', 'nested-supply', 'contained', 0)`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await expect(
      pool.query(
        `SELECT id, owner_location_id
         FROM item_instances
         WHERE story_id = 'restored-story'
         ORDER BY sort_order`,
      ),
    ).resolves.toMatchObject({
      rows: [
        { id: 'cabinet', owner_location_id: 'home' },
        { id: 'nested-supply', owner_location_id: null },
      ],
      rowCount: 2,
    });
    await expect(
      pool.query(
        `INSERT INTO item_instances
         (id, story_id, item_definition_id, owner_location_id, sort_order)
         VALUES ('foreign-root', 'restored-story', 'supply', 'missing-location', 2)`,
      ),
    ).rejects.toThrow();
  }, 30_000);

  it('generalizes legacy character and item stats into typed owner assignments', async () => {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');

    const typedStatsMigrationIndex = databaseMigrations.findIndex(
      ({ id }) => id === '202608220031_typed_stats',
    );
    for (const migration of databaseMigrations.slice(0, typedStatsMigrationIndex)) {
      await pool.query(migration.sql);
    }

    await pool.query(
      `INSERT INTO users (id, email, password_hash, created_at)
       VALUES ('stats-owner', 'stats@paralleax.invalid', 'disabled', now())`,
    );
    await pool.query(
      `INSERT INTO stories
       (id, revision, title, start_date_time, created_at, updated_at, creator_user_id)
       VALUES ('stats-story', 1, 'Typed stats', '2000-01-03T08:00', now(), now(), 'stats-owner')`,
    );
    await pool.query(
      `INSERT INTO characters
       (id, story_id, name, description, image_url, is_playable, sort_order)
       VALUES ('mira', 'stats-story', 'Mira', '', '', true, 0)`,
    );
    await pool.query(
      `INSERT INTO stat_definitions
       (id, story_id, name, category, image_url, change_per_hour, sort_order)
       VALUES ('durability', 'stats-story', 'Durability', '', '', 0, 0)`,
    );
    await pool.query(
      `INSERT INTO character_stats
       (id, story_id, character_id, stat_definition_id, initial_value, sort_order)
       VALUES ('mira-durability', 'stats-story', 'mira', 'durability', 4, 0)`,
    );
    await pool.query(
      `INSERT INTO item_definitions
       (id, story_id, name, description, category, image_url, stats, sort_order)
       VALUES (
         'key', 'stats-story', 'Key', '', '', '',
         '[{"statDefinitionId":"durability","initialValue":10}]'::jsonb,
         0
       )`,
    );
    await pool.query(
      `INSERT INTO item_instances
       (id, story_id, item_definition_id, owner_character_id, sort_order)
       VALUES ('key-1', 'stats-story', 'key', 'mira', 0)`,
    );
    await pool.query(
      `INSERT INTO interactions
       (id, story_id, title, body, position_x, position_y, location_id,
        duration_minutes, item_stat_effects, sort_order)
       VALUES (
         'damage-key', 'stats-story', 'Damage key', '', 0, 0, NULL, 0,
         '[{"itemId":"key-1","statDefinitionId":"durability","operation":"add","value":-2}]'::jsonb,
         0
       )`,
    );

    await pool.query(databaseMigrations[typedStatsMigrationIndex].sql);

    await expect(
      pool.query(
        `SELECT value_type FROM stat_definitions
         WHERE story_id = 'stats-story' AND id = 'durability'`,
      ),
    ).resolves.toMatchObject({
      rows: [{ value_type: 'number' }],
      rowCount: 1,
    });
    await expect(
      pool.query(
        `SELECT owner_type, character_id, item_definition_id, initial_value
         FROM stat_assignments
         WHERE story_id = 'stats-story'
         ORDER BY owner_type`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          owner_type: 'character',
          character_id: 'mira',
          item_definition_id: null,
          initial_value: 4,
        },
        {
          owner_type: 'item_definition',
          character_id: null,
          item_definition_id: 'key',
          initial_value: 10,
        },
      ],
      rowCount: 2,
    });
    await expect(
      pool.query(
        `SELECT effect.item_id, effect.operation, effect.value, assignment.item_definition_id
         FROM interaction_stat_effects effect
         JOIN stat_assignments assignment ON assignment.id = effect.stat_id
         WHERE effect.story_id = 'stats-story'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          item_id: 'key-1',
          operation: 'add',
          value: -2,
          item_definition_id: 'key',
        },
      ],
      rowCount: 1,
    });
    await expect(
      pool.query(
        `SELECT
           to_regclass('public.attribute_definitions') AS attribute_definitions,
           to_regclass('public.attribute_assignments') AS attribute_assignments,
           to_regclass('public.character_stats') AS character_stats`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          attribute_definitions: null,
          attribute_assignments: null,
          character_stats: null,
        },
      ],
      rowCount: 1,
    });

    await pool.query(`
      ALTER TABLE stat_definitions
      ADD COLUMN key text;
      UPDATE stat_definitions SET key = 'legacy_' || id;
      ALTER TABLE stat_definitions
      ALTER COLUMN key SET NOT NULL,
      ADD CONSTRAINT stat_definitions_story_key_unique UNIQUE (story_id, key),
      ADD CONSTRAINT stat_definitions_key_not_blank CHECK (btrim(key) <> '');
    `);
    const cleanupMigration = databaseMigrations.find(
      ({ id }) => id === '202608240032_remove_stat_definition_keys',
    );
    await pool.query(cleanupMigration!.sql);
    await expect(
      pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'stat_definitions'
           AND column_name = 'key'`,
      ),
    ).resolves.toMatchObject({ rows: [], rowCount: 0 });
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
