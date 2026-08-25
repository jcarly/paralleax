import { filter, firstValueFrom, take, toArray } from 'rxjs';
import { StoryEventsService } from './story.events';

describe('StoryEventsService', () => {
  afterEach(() => jest.useRealTimers());

  it('constructs one consistently timestamped story change', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T14:00:00.000Z'));
    const events = new StoryEventsService();
    const publish = jest.spyOn(events, 'publish');

    events.publishChange('story-1', 'updated', 4);

    expect(publish).toHaveBeenCalledWith({
      storyId: 'story-1',
      change: 'updated',
      revision: 4,
      occurredAt: '2026-08-25T14:00:00.000Z',
    });
  });

  it('starts with a reconnect instruction and isolates story changes', async () => {
    const events = new StoryEventsService();
    const received = firstValueFrom(
      events.stream('story-1').pipe(
        filter(({ type }) => type !== 'heartbeat'),
        take(3),
        toArray(),
      ),
    );

    events.publish({
      storyId: 'story-2',
      change: 'updated',
      revision: 2,
      occurredAt: '2026-08-16T09:00:00.000Z',
    });
    events.publish({
      storyId: 'story-1',
      change: 'updated',
      revision: 3,
      occurredAt: '2026-08-16T09:01:00.000Z',
    });
    events.publish({
      storyId: 'story-1',
      change: 'deleted',
      occurredAt: '2026-08-16T09:02:00.000Z',
    });

    await expect(received).resolves.toEqual([
      { type: 'ready', retry: 3_000, data: { storyId: 'story-1' } },
      {
        type: 'story-changed',
        data: {
          storyId: 'story-1',
          change: 'updated',
          revision: 3,
          occurredAt: '2026-08-16T09:01:00.000Z',
        },
      },
      {
        type: 'story-deleted',
        data: {
          storyId: 'story-1',
          change: 'deleted',
          occurredAt: '2026-08-16T09:02:00.000Z',
        },
      },
    ]);
  });
});
