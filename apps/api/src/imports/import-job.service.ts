import { Injectable, type MessageEvent, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

const IMPORT_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IMPORT_JOB_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class ImportJobService implements OnModuleInit, OnModuleDestroy {
  private readonly jobs = new Map<string, ImportJobSnapshot>();
  private readonly streams = new Map<string, Subject<MessageEvent>>();
  private readonly abortControllers = new Map<string, AbortController>();
  private cleanupTimer: NodeJS.Timeout | undefined;

  onModuleInit(): void {
    this.cleanupExpiredJobs();
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredJobs(),
      IMPORT_JOB_CLEANUP_INTERVAL_MS,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

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
    this.abortControllers.set(job.id, new AbortController());
    return job;
  }

  get(id: string): ImportJobSnapshot | undefined {
    return this.jobs.get(id);
  }

  update(id: string, data: Partial<ImportJobSnapshot>): ImportJobSnapshot | undefined {
    const current = this.jobs.get(id);
    if (!current) return undefined;
    if (current.status === 'cancelled') return current;
    const next: ImportJobSnapshot = { ...current, ...data, updatedAt: new Date().toISOString() };
    this.jobs.set(id, next);
    this.emit(id, { type: 'state', data: next });
    return next;
  }

  setStatus(id: string, status: ImportJobStatus): ImportJobSnapshot | undefined {
    return this.update(id, { status });
  }

  getAbortSignal(id: string): AbortSignal | undefined {
    return this.abortControllers.get(id)?.signal;
  }

  isCancelled(id: string): boolean {
    return this.jobs.get(id)?.status === 'cancelled';
  }

  cancel(id: string): boolean {
    const current = this.jobs.get(id);
    if (!current || isTerminal(current.status) || current.phase === 'saving') return false;
    this.update(id, { status: 'cancelled', reportAvailable: false });
    this.abortControllers.get(id)?.abort();
    this.complete(id);
    return true;
  }

  beginPersistence(id: string, data: Partial<ImportJobSnapshot> = {}): boolean {
    const current = this.jobs.get(id);
    if (!current || current.status !== 'running') return false;
    this.update(id, { ...data, status: 'running', phase: 'saving' });
    return true;
  }

  stream(ownerId: string, id: string): Observable<MessageEvent> {
    const current = this.jobs.get(id);
    if (current && isTerminal(current.status)) {
      return new Observable((subscriber) => {
        subscriber.next({ type: 'state', data: current });
        subscriber.complete();
      });
    }
    const stream = this.streams.get(id) ?? new Subject<MessageEvent>();
    this.streams.set(id, stream);
    return new Observable((subscriber) => {
      if (current) {
        subscriber.next({ type: 'state', data: current });
      }
      const sub = stream.subscribe({
        next: (event) => {
          const payload = event.data as { ownerId?: string; id?: string } | undefined;
          if (payload?.ownerId === ownerId || payload?.id === id) {
            subscriber.next(event);
          }
        },
        complete: () => subscriber.complete(),
      });
      return () => sub.unsubscribe();
    });
  }

  complete(id: string): void {
    const stream = this.streams.get(id);
    stream?.complete();
    this.streams.delete(id);
    this.abortControllers.delete(id);
  }

  cleanupExpiredJobs(now = Date.now()): number {
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (!isTerminal(job.status) || now - Date.parse(job.updatedAt) <= IMPORT_JOB_RETENTION_MS) {
        continue;
      }
      this.complete(id);
      this.jobs.delete(id);
      removed += 1;
    }
    return removed;
  }

  private emit(id: string, event: MessageEvent): void {
    const stream = this.streams.get(id);
    if (!stream) return;
    stream.next(event);
  }
}

function isTerminal(status: ImportJobStatus): boolean {
  return status === 'awaiting_confirmation' || status === 'completed' || status === 'failed' || status === 'cancelled';
}

function cryptoRandomId(): string {
  return randomUUID();
}
