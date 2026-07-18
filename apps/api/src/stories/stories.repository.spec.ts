import type { Story } from '@paralleax/shared';
import type { DatabaseConnection } from '../database/database.connection';
import type { DatabaseMigrator } from '../database/database.migrator';
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

function graphStory(): Story {
  const saved = story();
  saved.interactions = [
    {
      id: 'interaction-1',
      title: 'Start',
      body: 'Begin here',
      position: { x: 10, y: 20 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'interaction-2',
      title: 'Next',
      body: 'Continue here',
      position: { x: 30, y: 40 },
      triggers: [
        {
          id: 'trigger-2',
          inputInteractionIds: ['interaction-1'],
          conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
        },
      ],
    },
  ];
  return saved;
}

function storyRow(value = story()) {
  return {
    id: value.id,
    title: value.title,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt),
  };
}

function repository() {
  return new StoriesRepository(
    { pool: { query: mockQuery, connect: mockConnect } } as unknown as DatabaseConnection,
    { run: mockRunMigrations } as unknown as DatabaseMigrator,
  );
}

function relationalRead(query: jest.Mock, saved = story()) {
  query.mockImplementation((sql: string) => {
    if (sql.includes('FROM stories')) return Promise.resolve({ rows: [storyRow(saved)] });
    if (sql.includes('FROM trigger_inputs')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          interaction.triggers.flatMap((trigger) =>
            trigger.inputInteractionIds.map((inputId, index) => ({
              story_id: saved.id,
              trigger_id: trigger.id,
              input_interaction_id: inputId,
              sort_order: index,
            })),
          ),
        ),
      });
    }
    if (sql.includes('FROM trigger_conditions')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          interaction.triggers.flatMap((trigger) =>
            trigger.conditions.map((condition, index) => ({
              story_id: saved.id,
              trigger_id: trigger.id,
              interaction_id: condition.interactionId,
              has_been_visited: condition.hasBeenVisited,
              sort_order: index,
            })),
          ),
        ),
      });
    }
    if (sql.includes('FROM triggers')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          interaction.triggers.map((trigger, index) => ({
            id: trigger.id,
            story_id: saved.id,
            output_interaction_id: interaction.id,
            sort_order: index,
          })),
        ),
      });
    }
    if (sql.includes('FROM interactions')) {
      return Promise.resolve({
        rows: saved.interactions.map((interaction, index) => ({
          id: interaction.id,
          story_id: saved.id,
          title: interaction.title,
          body: interaction.body,
          position_x: interaction.position.x,
          position_y: interaction.position.y,
          sort_order: index,
        })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('StoriesRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
    mockRunMigrations.mockResolvedValue(undefined);
  });

  it('assembles stories from relational rows after migrations are ready', async () => {
    const saved = story();
    relationalRead(mockQuery, saved);

    const listed = await repository().list();
    listed[0].title = 'Mutated outside repository';

    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM stories'), [
      'migration-user',
    ]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM interactions'), [
      [saved.id],
    ]);
    expect(saved.title).toBe('Repository story');
  });

  it('finds and assembles a story by id', async () => {
    const saved = graphStory();
    relationalRead(mockQuery, saved);

    await expect(repository().find(saved.id)).resolves.toEqual(saved);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [
      saved.id,
      'migration-user',
    ]);
  });

  it('returns no stories without querying graph tables when metadata is empty', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(repository().list()).resolves.toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('saves the story metadata and graph transactionally', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const saved = story();

    await repository().save(saved);

    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id)'), [
      saved.id,
      saved.title,
      saved.createdAt,
      saved.updatedAt,
      'migration-user',
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM interactions WHERE story_id = $1', [
      saved.id,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('inserts relational interactions, triggers, inputs, and conditions', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const saved = graphStory();

    await repository().save(saved);

    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interactions'),
      ['interaction-1', saved.id, 'Start', 'Begin here', 10, 20, 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO triggers'), [
      'trigger-2',
      'interaction-2',
      0,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trigger_inputs'),
      ['trigger-2', 'interaction-1', 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trigger_conditions'),
      ['trigger-2', 0, 'interaction-1', true],
    );
  });

  it('deletes stories by owner and id', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await expect(repository().delete('story-1')).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM stories WHERE id = $1 AND creator_user_id = $2',
      ['story-1', 'migration-user'],
    );
  });

  it('writes only changed story fields during a mutation', async () => {
    const saved = story();
    let current = saved;
    mockClientQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('FROM stories')) return Promise.resolve({ rows: [storyRow(current)] });
      if (sql.startsWith('UPDATE stories SET')) {
        current = { ...current, title: values?.[1] as string, updatedAt: values?.[2] as string };
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const updated = await repository().mutate(saved.id, (value) => ({
      ...value,
      title: 'Updated transactionally',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }));

    expect(updated?.title).toBe('Updated transactionally');
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stories SET title = $2, updated_at = $3'),
      [saved.id, 'Updated transactionally', '2026-01-02T00:00:00.000Z'],
    );
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('persists interaction and trigger graph differences', async () => {
    const saved = graphStory();
    relationalRead(mockClientQuery, saved);

    await repository().mutate(saved.id, (value) => {
      value.interactions[0].title = 'Renamed start';
      value.interactions[0].position = { x: 50, y: 60 };
      value.interactions[0].triggers[0].conditions = [
        { interactionId: 'interaction-1', hasBeenVisited: false },
      ];
      value.interactions[0].triggers.push({
        id: 'trigger-3',
        inputInteractionIds: [],
        conditions: [],
      });
      value.interactions.splice(1, 1);
      return value;
    });

    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE interactions SET title = $2, position_x = $3, position_y = $4',
      ),
      ['interaction-1', 'Renamed start', 50, 60],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      'DELETE FROM interactions WHERE id = $1 AND story_id = $2',
      ['interaction-2', saved.id],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO triggers'), [
      'trigger-3',
      'interaction-1',
      1,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trigger_conditions'),
      ['trigger-1', 0, 'interaction-1', false],
    );
  });

  it('rolls back and releases the transaction when a mutation fails', async () => {
    relationalRead(mockClientQuery);
    await expect(
      repository().mutate('story-1', () => {
        throw new Error('mutation failed');
      }),
    ).rejects.toThrow('mutation failed');

    expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
