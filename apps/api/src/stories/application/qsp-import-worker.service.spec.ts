import { EventEmitter } from 'node:events';
import { ServiceUnavailableException } from '@nestjs/common';
import type { QspImportResult, QspImportSource } from '@paralleax/shared';

const mockWorkerConstructor = jest.fn();

jest.mock('node:worker_threads', () => ({ Worker: mockWorkerConstructor }));

import { QspImportWorkerService } from './qsp-import-worker.service';

const reportPath = 'C:\\tmp\\qsp-import-report.jsonl';

class TestWorker extends EventEmitter {
  readonly terminate = jest.fn(() => Promise.resolve(1));
}

function textSource(): QspImportSource {
  return {
    name: 'start.qsps',
    format: 'text',
    content: "# Start\n'Hello'\n--- Start ---",
  };
}

function emptyResult(): QspImportResult {
  return {
    report: {
      format: 'qsp',
      sourceFileCount: 1,
      locationCount: 1,
      actionCount: 0,
      interactionCount: 1,
      convertedStatementCount: 0,
      approximatedStatementCount: 0,
      unsupportedStatementCount: 0,
      warningCount: 0,
      errorCount: 0,
      coverage: [],
      issues: [],
    },
  };
}

describe('QspImportWorkerService', () => {
  const workers: TestWorker[] = [];

  beforeEach(() => {
    workers.length = 0;
    mockWorkerConstructor.mockReset();
    mockWorkerConstructor.mockImplementation(() => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker;
    });
  });

  it('transfers binary source ownership to the worker and returns its result', async () => {
    const source: QspImportSource = {
      name: 'game.qsp',
      format: 'binary',
      content: new Uint8Array([0x00, 0x01]).buffer,
    };
    const service = new QspImportWorkerService();
    const pending = service.run(source, undefined, undefined, reportPath);

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.stringMatching(/qsp-import\.worker\.js$/),
      {
        workerData: expect.objectContaining({ source, reportPath }),
        transferList: [source.content],
      },
    );

    const result = emptyResult();
    workers[0].emit('message', { type: 'result', result });

    await expect(pending).resolves.toEqual(result);
  });

  it('propagates worker crashes instead of returning a fabricated conversion report', async () => {
    const service = new QspImportWorkerService();
    const pending = service.run(textSource(), undefined, undefined, reportPath);

    workers[0].emit('error', new Error('worker bootstrap failed'));

    await expect(pending).rejects.toThrow('worker bootstrap failed');
  });

  it('forwards worker progress to the import orchestration', async () => {
    const progress = jest.fn();
    const service = new QspImportWorkerService();
    const pending = service.run(textSource(), progress, undefined, reportPath);

    workers[0].emit('message', {
      type: 'progress',
      progress: {
        phase: 'parsing',
        completed: 25,
        total: 40,
        currentFile: 'locations/room.qsrc',
      },
    });
    workers[0].emit('message', { type: 'result', result: emptyResult() });

    await expect(pending).resolves.toEqual(emptyResult());
    expect(progress).toHaveBeenCalledWith({
      phase: 'parsing',
      completed: 25,
      total: 40,
      currentFile: 'locations/room.qsrc',
    });
  });

  it('keeps only one active worker import', async () => {
    const service = new QspImportWorkerService();
    const first = service.run(textSource(), undefined, undefined, reportPath);

    await expect(
      service.run(textSource(), undefined, undefined, reportPath),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    workers[0].emit('message', { type: 'result', result: emptyResult() });
    await expect(first).resolves.toEqual(emptyResult());
  });

  it('terminates a worker when the importing request is cancelled', async () => {
    const controller = new AbortController();
    const service = new QspImportWorkerService();
    const pending = service.run(textSource(), undefined, controller.signal, reportPath);

    controller.abort();

    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toThrow('QSP import worker cancelled.');
  });

  it('terminates active workers during graceful shutdown', async () => {
    const service = new QspImportWorkerService();
    const pending = service.run(textSource(), undefined, undefined, reportPath);

    const stopping = service.onModuleDestroy();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    workers[0].emit('exit', 1);

    await stopping;
    await expect(pending).rejects.toThrow('QSP import worker exited before returning a result');
    await expect(
      service.run(textSource(), undefined, undefined, reportPath),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
