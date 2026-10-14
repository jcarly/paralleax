import { Injectable, type MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type { ImportProgress } from '@paralleax/shared';

export type ImportJobStatus =
  'queued' | 'running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'cancelled';

export interface ImportJobSnapshot {
  id: string;
  ownerId: string;
  format: string;
  status: ImportJobStatus;
  phase?: ImportProgress['phase'];
  progress: number;
  total?: number;
  currentFile?: string;
  warningCount: number;
  errorCount: number;
  reportAvailable: boolean;
  storyId?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ImportJobService {
  private readonly jobs = new Map<string, ImportJobSnapshot>();
  private readonly streams = new Map<string, Subject<MessageEvent>>();

  create(ownerId: string, format: string): ImportJobSnapshot {
    const now = new Date().toISOString();
    const job: ImportJobSnapshot = {
      id: cryptoRandomId(),
      ownerId,
      format,
      status: 'queued',
      phase: 'uploading',
      progress: 0,
      warningCount: 0,
      errorCount: 0,
      reportAvailable: false,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): ImportJobSnapshot | undefined {
    return this.jobs.get(id);
  }

  update(id: string, data: Partial<ImportJobSnapshot>): ImportJobSnapshot | undefined {
    const current = this.jobs.get(id);
    if (!current) return undefined;
    const next: ImportJobSnapshot = { ...current, ...data, updatedAt: new Date().toISOString() };
    this.jobs.set(id, next);
    this.emit(id, { type: 'state', data: next });
    return next;
  }

  setStatus(id: string, status: ImportJobStatus): ImportJobSnapshot | undefined {
    return this.update(id, { status });
  }

  stream(ownerId: string, id: string): Observable<MessageEvent> {
    const stream = this.streams.get(id) ?? new Subject<MessageEvent>();
    this.streams.set(id, stream);
    const current = this.jobs.get(id);
    return new Observable((subscriber) => {
      if (current) {
        subscriber.next({ type: 'state', data: current });
      }
      const sub = stream.subscribe((event) => {
        const payload = event.data as { ownerId?: string; id?: string } | undefined;
        if (payload?.ownerId === ownerId || payload?.id === id) {
          subscriber.next(event);
        }
      });
      return () => sub.unsubscribe();
    });
  }

  complete(id: string): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    stream.complete();
    this.streams.delete(id);
  }

  private emit(id: string, event: MessageEvent): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    stream.next(event);
  }
}

function cryptoRandomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
