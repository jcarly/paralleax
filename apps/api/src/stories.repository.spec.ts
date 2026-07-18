import type { Story } from '@paralleax/shared';
import type { DatabaseConnection } from './database.connection';
import type { DatabaseMigrator } from './database.migrator';
import { StoriesRepository } from './stories.repository';

const mockQuery = jest.fn();
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
    { pool: { query: mockQuery } } as unknown as DatabaseConnection,
    { run: mockRunMigrations } as unknown as DatabaseMigrator,
  );
}

describe('StoriesRepository', () => {
  beforeEach(() => {
    mockQuery.mockReset();
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
      'SELECT data FROM stories ORDER BY updated_at DESC, created_at DESC',
    );
    expect(saved.title).toBe('Repository story');
  });

  it('finds a story by id', async () => {
    const saved = story();
    mockQuery.mockResolvedValue({ rows: [{ data: saved }] });

    await expect(repository().find(saved.id)).resolves.toEqual(saved);

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith('SELECT data FROM stories WHERE id = $1', [saved.id]);
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
    ]);
  });

  it('deletes stories by id', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    await expect(repository().delete('story-1')).resolves.toBe(true);

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith('DELETE FROM stories WHERE id = $1', ['story-1']);
  });
});
