import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';

import {
  createQspImportFailureResult,
  type QspImportProgress,
  type QspImportResult,
  type QspImportSource,
} from '@paralleax/shared';

import type { QspWorkerInput, QspWorkerMessage } from './qsp-import.worker-protocol.js';

@Injectable()
export class QspImportWorkerService implements OnModuleDestroy {
  private activeImports = 0;
  private isShuttingDown = false;
  private readonly workers = new Set<Worker>();

  async run(
    source: QspImportSource,
    onProgress?: (progress: QspImportProgress) => void,
    abortSignal?: AbortSignal,
  ): Promise<QspImportResult> {
    if (this.isShuttingDown) {
      throw new ServiceUnavailableException(
        'QSP imports are unavailable while the API is shutting down.',
      );
    }
    if (this.activeImports >= 1) {
      throw new ServiceUnavailableException('Another QSP import is already running.');
    }
    if (abortSignal?.aborted) {
      return createQspImportFailureResult(source);
    }

    this.activeImports += 1;

    try {
      const input: QspWorkerInput = {
        source,
        storyId: randomUUID(),
        timestamp: new Date().toISOString(),
      };

      try {
        return await this.execute(input, onProgress, abortSignal);
      } catch {
        return createQspImportFailureResult(source);
      }
    } finally {
      this.activeImports -= 1;
    }
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    await Promise.all([...this.workers].map((worker) => worker.terminate().catch(() => undefined)));
  }

  private execute(
    input: QspWorkerInput,
    onProgress?: (progress: QspImportProgress) => void,
    abortSignal?: AbortSignal,
  ): Promise<QspImportResult> {
    return new Promise((resolvePromise, rejectPromise) => {
      const workerPath = resolve(__dirname, 'qsp-import.worker.js');

      const worker = new Worker(workerPath, {
        workerData: input,
        transferList: input.source.format === 'binary' ? [input.source.content] : [],
      });
      this.workers.add(worker);

      let settled = false;
      let abort: () => void = () => undefined;

      const removeAbortListener = () => abortSignal?.removeEventListener('abort', abort);

      const fail = (error: Error) => {
        if (settled) return;

        settled = true;
        removeAbortListener();
        rejectPromise(error);
      };

      abort = () => {
        if (settled) return;

        void worker
          .terminate()
          .catch(() => undefined)
          .finally(() => fail(new Error('QSP import worker cancelled.')));
      };
      abortSignal?.addEventListener('abort', abort, { once: true });

      worker.on('message', (message: QspWorkerMessage) => {
        if (settled) return;

        if (message.type === 'progress') {
          try {
            onProgress?.(message.progress);
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
            void worker.terminate();
          }
          return;
        }

        if (message.type === 'result') {
          settled = true;
          removeAbortListener();
          resolvePromise(message.result);
        }
      });

      worker.once('error', fail);

      worker.once('exit', (code) => {
        this.workers.delete(worker);
        if (!settled) {
          fail(new Error(`QSP import worker exited before returning a result (code ${code}).`));
        }
      });
    });
  }
}
