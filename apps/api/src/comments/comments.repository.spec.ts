import type { DatabaseConnection } from '../database/database.connection';
import { CommentsRepository } from './comments.repository';

describe('CommentsRepository', () => {
  it('groups ordered messages by thread in one list projection', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          threadRow('thread-new', '2026-08-25T10:00:00.000Z'),
          threadRow('thread-empty', '2026-08-25T09:00:00.000Z'),
          threadRow('thread-old', '2026-08-25T08:00:00.000Z'),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          messageRow('new-1', 'thread-new', '2026-08-25T07:00:00.000Z'),
          messageRow('old-1', 'thread-old', '2026-08-25T07:30:00.000Z'),
          messageRow('new-2', 'thread-new', '2026-08-25T08:00:00.000Z'),
        ],
      });
    const repository = new CommentsRepository({ pool: { query } } as unknown as DatabaseConnection);

    const threads = await repository.list('story-1');

    expect(threads.map(({ id }) => id)).toEqual(['thread-new', 'thread-empty', 'thread-old']);
    expect(threads[0].messages.map(({ id }) => id)).toEqual(['new-1', 'new-2']);
    expect(threads[1].messages).toEqual([]);
    expect(threads[2].messages.map(({ id }) => id)).toEqual(['old-1']);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('message.thread_id = ANY'), [
      ['thread-new', 'thread-empty', 'thread-old'],
    ]);
  });

  it('does not query messages when the story has no comment threads', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const repository = new CommentsRepository({ pool: { query } } as unknown as DatabaseConnection);

    await expect(repository.list('story-1')).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

function threadRow(id: string, updatedAt: string) {
  return {
    id,
    story_id: 'story-1',
    anchor: { kind: 'canvas' as const, position: { x: 10, y: 20 } },
    anchor_label: 'Story graph',
    status: 'open' as const,
    created_by: 'user-1',
    created_by_email: 'author@example.com',
    created_at: '2026-08-25T07:00:00.000Z',
    updated_at: updatedAt,
    resolved_by: null,
    resolved_by_email: null,
    resolved_at: null,
  };
}

function messageRow(id: string, threadId: string, createdAt: string) {
  return {
    id,
    thread_id: threadId,
    author_user_id: 'user-1',
    author_email: 'author@example.com',
    body: id,
    created_at: createdAt,
    edited_at: null,
  };
}
