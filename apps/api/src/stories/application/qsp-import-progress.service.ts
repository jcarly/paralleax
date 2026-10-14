import { ForbiddenException, Injectable, type MessageEvent } from '@nestjs/common';
import { Observable, Subject, type Subscription } from 'rxjs';

import type { QspImportProgress } from '@paralleax/shared';

const HEARTBEAT_INTERVAL_MS = 25_000;

interface ProgressChannel {
  userId: string;
  subscribers: number;
  progress: Subject<QspImportProgress>;
}

@Injectable()
export class QspImportProgressService {
  private readonly channels = new Map<string, ProgressChannel>();

  stream(userId: string, progressId: string): Observable<MessageEvent> {
    const channel = this.openChannel(userId, progressId);

    return new Observable((subscriber) => {
      channel.subscribers += 1;
      subscriber.next({
        type: 'ready',
        retry: 3_000,
        data: { progressId },
      });

      const progressSubscription: Subscription = channel.progress.subscribe({
        next: (progress) => subscriber.next({ type: 'progress', data: progress }),
        complete: () => subscriber.complete(),
      });
      const heartbeat = setInterval(() => {
        subscriber.next({
          type: 'heartbeat',
          data: { progressId, occurredAt: new Date().toISOString() },
        });
      }, HEARTBEAT_INTERVAL_MS);

      return () => {
        clearInterval(heartbeat);
        progressSubscription.unsubscribe();
        channel.subscribers -= 1;
        if (channel.subscribers === 0 && this.channels.get(progressId) === channel) {
          this.channels.delete(progressId);
        }
      };
    });
  }

  publish(userId: string, progressId: string | undefined, progress: QspImportProgress) {
    if (!progressId) return;

    const channel = this.channels.get(progressId);
    if (!channel || channel.userId !== userId) return;

    channel.progress.next(progress);
  }

  complete(userId: string, progressId: string | undefined) {
    if (!progressId) return;

    const channel = this.channels.get(progressId);
    if (!channel || channel.userId !== userId) return;

    this.channels.delete(progressId);
    channel.progress.complete();
  }

  private openChannel(userId: string, progressId: string): ProgressChannel {
    const existing = this.channels.get(progressId);
    if (existing) {
      if (existing.userId !== userId) {
        throw new ForbiddenException('This QSP import progress stream belongs to another user.');
      }
      return existing;
    }

    const channel: ProgressChannel = {
      userId,
      subscribers: 0,
      progress: new Subject<QspImportProgress>(),
    };
    this.channels.set(progressId, channel);
    return channel;
  }
}
