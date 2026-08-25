import { Injectable, type MessageEvent } from '@nestjs/common';
import { filter, interval, map, merge, of, Subject, type Observable } from 'rxjs';

export type StoryChangeType = 'updated' | 'access-updated' | 'deleted';

export interface StoryChangeEvent {
  storyId: string;
  change: StoryChangeType;
  revision?: number;
  occurredAt: string;
}

const heartbeatIntervalMs = 25_000;

@Injectable()
export class StoryEventsService {
  private readonly changes = new Subject<StoryChangeEvent>();

  publish(event: StoryChangeEvent) {
    this.changes.next(event);
  }

  publishChange(storyId: string, change: StoryChangeType, revision?: number) {
    this.publish({
      storyId,
      change,
      revision,
      occurredAt: new Date().toISOString(),
    });
  }

  stream(storyId: string): Observable<MessageEvent> {
    return merge(
      of({
        type: 'ready',
        retry: 3_000,
        data: { storyId },
      }),
      this.changes.pipe(
        filter((event) => event.storyId === storyId),
        map((event) => ({
          type: event.change === 'deleted' ? 'story-deleted' : 'story-changed',
          data: event,
        })),
      ),
      interval(heartbeatIntervalMs).pipe(
        map(() => ({
          type: 'heartbeat',
          data: { storyId, occurredAt: new Date().toISOString() },
        })),
      ),
    );
  }
}
