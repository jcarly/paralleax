import type { StoryChangeDelta } from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';
import {
  findStoryHistoryCandidate,
  insertStoryHistoryEvent,
  readStoryHistory,
} from './story-history.persistence';

const changes: StoryChangeDelta = {
  kind: 'value',
  beforeExists: true,
  afterExists: true,
  before: 'Before',
  after: 'After',
};

describe('Story history persistence', () => {
  const query = jest.fn();
  const client = { query } as unknown as Queryable;

  beforeEach(() => query.mockReset());

  it('inserts a reversible event and returns its database id', async () => {
    query.mockResolvedValue({ rows: [{ id: 42 }] });

    await expect(
      insertStoryHistoryEvent(client, {
        storyId: 'story-1',
        actorUserId: 'user-1',
        revision: 2,
        kind: 'change',
        operation: 'story.updated',
        changes,
        createdAt: '2026-08-28T08:00:00.000Z',
      }),
    ).resolves.toBe('42');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO story_change_events'), [
      'story-1',
      'user-1',
      2,
      'change',
      'story.updated',
      JSON.stringify(changes),
      null,
      '2026-08-28T08:00:00.000Z',
    ]);
  });

  it.each([
    ['undo', ['change', 'redo']],
    ['redo', ['undo']],
  ] as const)('finds the latest active %s candidate', async (action, kinds) => {
    const row = historyRow();
    query.mockResolvedValue({ rows: [row] });

    await expect(findStoryHistoryCandidate(client, 'story-1', 'user-1', action)).resolves.toBe(row);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), [
      'story-1',
      'user-1',
      kinds,
    ]);
  });

  it('returns undefined when the author has no active candidate', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(
      findStoryHistoryCandidate(client, 'story-1', 'user-1', 'undo'),
    ).resolves.toBeUndefined();
  });

  it('maps recent entries and author-specific availability', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { ...historyRow(), can_undo: true, can_redo: false },
        {
          ...historyRow(),
          id: '41',
          actor_user_id: null,
          actor_email: null,
          created_at: '2026-08-28T07:00:00.000Z',
          reverted: true,
          can_undo: true,
          can_redo: false,
        },
      ],
    });

    await expect(readStoryHistory(client, 'story-1', 'user-1', 25)).resolves.toEqual({
      entries: [
        {
          id: '42',
          revision: 2,
          kind: 'change',
          operation: 'story.updated',
          actor: { id: 'user-1', email: 'author@example.com' },
          createdAt: '2026-08-28T08:00:00.000Z',
          reverted: false,
        },
        {
          id: '41',
          revision: 2,
          kind: 'change',
          operation: 'story.updated',
          createdAt: '2026-08-28T07:00:00.000Z',
          reverted: true,
        },
      ],
      canUndo: true,
      canRedo: false,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('AS can_redo'), [
      'story-1',
      'user-1',
      25,
    ]);
  });

  it('defaults availability when the aggregate query returns no row', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(readStoryHistory(client, 'story-1', 'user-1')).resolves.toEqual({
      entries: [],
      canUndo: false,
      canRedo: false,
    });
  });

  it('keeps availability when there are no recent entries', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: null, can_undo: false, can_redo: true }],
    });

    await expect(readStoryHistory(client, 'story-1', 'user-1')).resolves.toEqual({
      entries: [],
      canUndo: false,
      canRedo: true,
    });
  });
});

function historyRow() {
  return {
    id: 42,
    revision: 2,
    kind: 'change' as const,
    operation: 'story.updated',
    changes,
    actor_user_id: 'user-1',
    actor_email: 'author@example.com',
    created_at: new Date('2026-08-28T08:00:00.000Z'),
    reverted: false,
  };
}
