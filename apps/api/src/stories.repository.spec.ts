import type { Story } from '@paralleax/shared';
import type { DatabaseConnection } from './database.connection';
import type { DatabaseMigrator } from './database.migrator';
import { StoriesRepository } from './stories.repository';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();
const mockRunMigrations = jest.fn();

function story(id = 'story-1'): Story {
  return {
    id,
    title: 'Repository story',
    interactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function repository() {
  return new StoriesRepository(
    { pool: { query: mockQuery, connect: mockConnect } } as unknown as DatabaseConnection,
    { run: mockRunMigrations } as unknown as DatabaseMigrator,
  );
}

describe('StoriesRepository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockReset();
    mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
    mockRunMigrations.mockReset();
    mockRunMigrations.mockResolvedValue(undefined);
  });

  it('lists stories from persisted JSON documents after migrations are ready', async () => {
    const saved = story();
    mockQuery.mockResolvedValue({ rows: [{ data: saved }] });

    const listed = await repository().list();
    listed[0].title = 'Mutated outside repository';

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT data FROM stories WHERE creator_user_id = $1 ORDER BY updated_at DESC, created_at DESC',
      ['migration-user'],
    );
    expect(saved.title).toBe('Repository story');
  });

  it('finds a story by id', async () => {
    const saved = story();
    mockQuery.mockResolvedValue({ rows: [{ data: saved }] });

    await expect(repository().find(saved.id)).resolves.toEqual(saved);

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT data FROM stories WHERE id = $1 AND creator_user_id = $2',
      [saved.id, 'migration-user'],
    );
  });

  it('saves stories with an upsert', async () => {
    const saved = story();
    mockQuery.mockResolvedValue({ rows: [] });

    await repository().save(saved);

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id)'), [
      saved.id,
      JSON.stringify(saved),
      saved.createdAt,
      saved.updatedAt,
      'migration-user',
    ]);
  });

  it('deletes stories by id', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await expect(repository().delete('story-1')).resolves.toBe(true);

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM stories WHERE id = $1 AND creator_user_id = $2',
      ['story-1', 'migration-user'],
    );
  });

  it('locks, updates, and commits one story mutation transactionally', async () => {
    const saved = story();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ data: saved }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const updated = await repository().mutate(saved.id, (current) => ({
      ...current,
      title: 'Updated transactionally',
    }));

    expect(updated?.title).toBe('Updated transactionally');
    expect(mockClientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      2,
      'SELECT data FROM stories WHERE id = $1 AND creator_user_id = $2 FOR UPDATE',
      [saved.id, 'migration-user'],
    );
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE stories'),
      expect.arrayContaining([saved.id, expect.stringContaining('Updated transactionally')]),
    );
    expect(mockClientQuery).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the transaction when a mutation fails', async () => {
    const saved = story();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ data: saved }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      repository().mutate(saved.id, () => {
        throw new Error('mutation failed');
      }),
    ).rejects.toThrow('mutation failed');

    expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
