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
});
