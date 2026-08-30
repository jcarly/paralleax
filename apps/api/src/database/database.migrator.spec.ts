import type { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';
import { databaseMigrations } from './database.migrations';

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

function migrator() {
  return new DatabaseMigrator({
    pool: {
      connect: mockConnect,
    },
  } as unknown as DatabaseConnection);
}

describe('DatabaseMigrator', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('creates the migration table and applies pending migrations transactionally', async () => {
    await migrator().run();

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('schema_migrations'));
    expect(mockQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).toHaveBeenCalledWith(databaseMigrations[0].sql);
    expect(mockQuery).toHaveBeenCalledWith(databaseMigrations[1].sql);
    expect(mockQuery).toHaveBeenCalledWith('INSERT INTO schema_migrations (id) VALUES ($1)', [
      databaseMigrations[0].id,
    ]);
    expect(mockQuery).toHaveBeenCalledWith('INSERT INTO schema_migrations (id) VALUES ($1)', [
      databaseMigrations[1].id,
    ]);
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('skips already applied migrations', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql === 'SELECT id FROM schema_migrations WHERE id = $1') {
        return Promise.resolve({ rows: [{ id: databaseMigrations[0].id }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    await migrator().run();

    expect(mockQuery).not.toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).not.toHaveBeenCalledWith(databaseMigrations[0].sql);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the client when a migration fails', async () => {
    const error = new Error('migration failed');
    mockQuery.mockImplementation((sql: string) => {
      if (sql === databaseMigrations[0].sql) return Promise.reject(error);
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    await expect(migrator().run()).rejects.toThrow(error);

    expect(mockQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('reuses the same migration run promise', async () => {
    const service = migrator();

    await service.run();
    await service.run();

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('keeps every migration free from wholesale story deletion', () => {
    for (const migration of databaseMigrations) {
      expect(migration.sql).not.toMatch(/\bDELETE\s+FROM\s+stories\b/i);
      expect(migration.sql).not.toMatch(/\bTRUNCATE\s+(?:TABLE\s+)?stories\b/i);
      expect(migration.sql).not.toMatch(/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?stories\b/i);
    }
  });

  it('copies legacy character items before retiring their write table', () => {
    const migration = databaseMigrations.find(({ id }) => id === '202608020021_item_instances');

    expect(migration?.sql).toMatch(/INSERT INTO item_instances[\s\S]+FROM character_items/i);
    expect(migration?.sql).toMatch(/REFERENCES item_instances\(story_id, id\) ON DELETE CASCADE/i);
    expect(migration?.sql).toMatch(/ALTER TABLE character_items RENAME TO character_items_legacy/i);
    expect(migration?.sql).not.toMatch(/DROP TABLE\s+character_items/i);
  });

  it('constrains typed item relationships to one distinct parent per child', () => {
    const migration = databaseMigrations.find(
      ({ id }) => id === '202608020022_item_instance_relationships',
    );

    expect(migration?.sql).toMatch(/UNIQUE \(story_id, child_item_id\)/i);
    expect(migration?.sql).toMatch(/CHECK \(parent_item_id <> child_item_id\)/i);
    expect(migration?.sql).toMatch(/'contained'[\s\S]+'held'/i);
    expect(migration?.sql).toMatch(/REFERENCES item_instances\(story_id, id\)/i);
    expect(migration?.sql).toMatch(/WITH RECURSIVE ancestors/i);
    expect(migration?.sql).toMatch(/A related item cannot also have a root owner/i);
  });

  it('removes location-rooted item trees and keeps character or parent placements', () => {
    const migration = databaseMigrations.find(
      ({ id }) => id === '202608090023_remove_location_item_roots',
    );

    expect(migration?.sql).toMatch(/WITH RECURSIVE location_item_tree/i);
    expect(migration?.sql).toMatch(/DELETE FROM item_instances/i);
    expect(migration?.sql).toMatch(/DROP COLUMN owner_location_id/i);
    expect(migration?.sql).toMatch(/DROP INDEX item_instances_location_id_idx/i);
    expect(migration?.sql).toMatch(/ownedItemIds/i);
    expect(migration?.sql).toMatch(/itemStatValues/i);
    expect(migration?.sql).toMatch(/An item must belong to exactly one character or parent item/i);
  });

  it('adds sortable categories to every reusable story-context entity', () => {
    const migration = databaseMigrations.find(({ id }) => id === '202608100024_content_categories');

    for (const table of ['locations', 'characters', 'stat_definitions', 'item_definitions']) {
      expect(migration?.sql).toContain(
        `ALTER TABLE ${table} ADD COLUMN category text NOT NULL DEFAULT '';`,
      );
    }
  });

  it('restores location-rooted item placement without rewriting migration history', () => {
    const migration = databaseMigrations.find(
      ({ id }) => id === '202608130025_restore_location_item_roots',
    );

    expect(migration?.sql).toMatch(/ADD COLUMN owner_location_id text/i);
    expect(migration?.sql).toMatch(/REFERENCES locations\(story_id, id\) ON DELETE CASCADE/i);
    expect(migration?.sql).toMatch(/num_nonnulls\(owner_character_id, owner_location_id\)/i);
    expect(migration?.sql).toMatch(/exactly one character, location, or parent item/i);
  });

  it('adds constrained global and story access control storage', () => {
    const migration = databaseMigrations.find(({ id }) => id === '202608130026_access_control');

    expect(migration?.sql).toMatch(/ADD COLUMN role text NOT NULL DEFAULT 'user'/i);
    expect(migration?.sql).toMatch(/role IN \('user', 'admin'\)/i);
    expect(migration?.sql).toMatch(/ADD COLUMN visibility text NOT NULL DEFAULT 'private'/i);
    expect(migration?.sql).toMatch(/ADD COLUMN edit_policy text NOT NULL DEFAULT 'owner'/i);
    expect(migration?.sql).toMatch(/ADD COLUMN comment_policy text NOT NULL DEFAULT 'disabled'/i);
    expect(migration?.sql).toMatch(/CREATE TABLE story_user_permissions/i);
    expect(migration?.sql).toMatch(/role IN \('viewer', 'editor'\)/i);
  });

  it('adds constrained story-local graph decoration storage', () => {
    const migration = databaseMigrations.find(({ id }) => id === '202608140029_graph_decorations');

    expect(migration?.sql).toMatch(/CREATE TABLE graph_decorations/i);
    expect(migration?.sql).toMatch(/REFERENCES stories\(id\) ON DELETE CASCADE/i);
    expect(migration?.sql).toMatch(/kind IN \('frame', 'text'\)/i);
    expect(migration?.sql).toMatch(/width >= 120 AND height >= 80/i);
    expect(migration?.sql).toMatch(/font_size BETWEEN 10 AND 96/i);
  });

  it('defaults comments to editors and maps the removed policies forward', () => {
    const migration = databaseMigrations.find(({ id }) => id === '202608160030_reader_comments');

    expect(migration?.sql).toMatch(/WHEN 'authenticated' THEN 'readers'/i);
    expect(migration?.sql).toMatch(/WHEN 'disabled' THEN 'editors'/i);
    expect(migration?.sql).toMatch(/ALTER COLUMN comment_policy SET DEFAULT 'editors'/i);
    expect(migration?.sql).toMatch(/comment_policy IN \('editors', 'readers'\)/i);
  });

  it('migrates the existing progress row into the reader autosave slot', () => {
    const migration = databaseMigrations.find(({ id }) => id === '202608270033_reader_save_slots');

    expect(migration?.sql).toMatch(/ADD COLUMN slot_id text NOT NULL DEFAULT 'reader-autosave'/i);
    expect(migration?.sql).toMatch(/SET created_at = updated_at/i);
    expect(migration?.sql).toMatch(/PRIMARY KEY \(user_id, story_id, slot_id\)/i);
    expect(migration?.sql).toMatch(/'simulation-autosave'/i);
    expect(migration?.sql).toMatch(/length\(btrim\(name\)\) BETWEEN 1 AND 100/i);
  });

  it('adds append-only reversible Story change events', () => {
    const migration = databaseMigrations.find(
      ({ id }) => id === '202608280034_story_change_history',
    );

    expect(migration?.sql).toMatch(/CREATE TABLE story_change_events/i);
    expect(migration?.sql).toMatch(/actor_user_id text REFERENCES users\(id\) ON DELETE SET NULL/i);
    expect(migration?.sql).toMatch(/kind IN \('change', 'undo', 'redo'\)/i);
    expect(migration?.sql).toMatch(/changes jsonb NOT NULL/i);
    expect(migration?.sql).toMatch(/reverts_event_id bigint UNIQUE/i);
    expect(migration?.sql).toMatch(/UNIQUE \(story_id, revision\)/i);
  });
});
