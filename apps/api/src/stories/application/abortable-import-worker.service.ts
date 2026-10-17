import { OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';

export type ImportWorkerMessage<TProgress, TResult> =
  | { type: 'progress'; progress: TProgress }
  | { type: 'result'; result: TResult }
  | { type: 'error'; message: string };

interface ExecuteWorkerOptions<TProgress> {
  name: string;
  onProgress?: (progress: TProgress) => void;
  abortSignal?: AbortSignal;
  transferList?: ArrayBuffer[];
}

export abstract class AbortableImportWorkerService implements OnModuleDestroy {
  private readonly workers = new Set<Worker>();
  private isShuttingDown = false;

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    await Promise.all([...this.workers].map((worker) => worker.terminate().catch(() => undefined)));
  }

  protected executeWorker<TInput, TProgress, TResult>(
    workerPath: string,
    input: TInput,
    options: ExecuteWorkerOptions<TProgress>,
  ): Promise<TResult> {
    if (this.isShuttingDown) {
      throw new ServiceUnavailableException('Import workers are unavailable during API shutdown.');
    }
    if (options.abortSignal?.aborted) {
      throw new Error(`${options.name} worker cancelled before execution.`);
    }

    return new Promise((resolvePromise, rejectPromise) => {
      const worker = new Worker(workerPath, {
        workerData: input,
        transferList: options.transferList ?? [],
      });
      this.workers.add(worker);

      let settled = false;
      let abort: () => void = () => undefined;

      const removeAbortListener = () => options.abortSignal?.removeEventListener('abort', abort);

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
          .finally(() => fail(new Error(`${options.name} worker cancelled.`)));
      };
      options.abortSignal?.addEventListener('abort', abort, { once: true });

      worker.on('message', (message: ImportWorkerMessage<TProgress, TResult>) => {
        if (settled) return;

        if (message.type === 'progress') {
          try {
            options.onProgress?.(message.progress);
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
          return;
        }

        if (message.type === 'error') fail(new Error(message.message));
      });

      worker.once('error', fail);

      worker.once('exit', (code) => {
        this.workers.delete(worker);
        if (!settled) {
          fail(new Error(`${options.name} worker exited before returning a result (code ${code}).`));
        }
      });
    });
  }
}