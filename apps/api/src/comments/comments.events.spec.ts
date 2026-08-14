import { firstValueFrom, filter, take, toArray } from 'rxjs';
import { CommentEventsService } from './comments.events';

describe('CommentEventsService', () => {
  it('starts with a reconnect instruction and isolates story changes', async () => {
    const events = new CommentEventsService();
    const received = firstValueFrom(
      events.stream('story-1').pipe(
        filter(({ type }) => type !== 'heartbeat'),
        take(2),
        toArray(),
      ),
    );

    events.publish({
      storyId: 'story-2',
      threadId: 'other-thread',
      change: 'message-added',
      occurredAt: '2026-08-13T09:00:00.000Z',
    });
    events.publish({
      storyId: 'story-1',
      threadId: 'thread-1',
      change: 'status-changed',
      occurredAt: '2026-08-13T09:01:00.000Z',
    });

    await expect(received).resolves.toEqual([
      { type: 'ready', retry: 3_000, data: { storyId: 'story-1' } },
      {
        type: 'comments-changed',
        data: {
          storyId: 'story-1',
          threadId: 'thread-1',
          change: 'status-changed',
          occurredAt: '2026-08-13T09:01:00.000Z',
        },
      },
    ]);
  });
});
