import { Injectable, type MessageEvent } from '@nestjs/common';
import { interval, map, merge, of, Subject, filter, type Observable } from 'rxjs';

export type CommentChangeType =
  'thread-created' | 'message-added' | 'status-changed' | 'anchor-changed';

export interface CommentChangeEvent {
  storyId: string;
  threadId: string;
  change: CommentChangeType;
  occurredAt: string;
}

const heartbeatIntervalMs = 25_000;

@Injectable()
export class CommentEventsService {
  private readonly changes = new Subject<CommentChangeEvent>();

  publish(event: CommentChangeEvent) {
    this.changes.next(event);
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
        map((event) => ({ type: 'comments-changed', data: event })),
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
