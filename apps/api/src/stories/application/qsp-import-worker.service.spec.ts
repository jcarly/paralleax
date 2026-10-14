import { EventEmitter } from 'node:events';
import { ServiceUnavailableException } from '@nestjs/common';
import type { QspImportResult, QspImportSource } from '@paralleax/shared';

const mockWorkerConstructor = jest.fn();

jest.mock('node:worker_threads', () => ({ Worker: mockWorkerConstructor }));

import { QspImportWorkerService } from './qsp-import-worker.service';

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
    const pending = service.run(source);

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.stringMatching(/qsp-import\.worker\.js$/),
      {
        workerData: expect.objectContaining({ source }),
        transferList: [source.content],
      },
    );

    const result = emptyResult();
    workers[0].emit('message', { type: 'result', result });

    await expect(pending).resolves.toEqual(result);
  });

  it('returns a downloadable failure report when the worker crashes', async () => {
    const service = new QspImportWorkerService();
    const pending = service.run(textSource());

    workers[0].emit('error', new Error('worker bootstrap failed'));

    await expect(pending).resolves.toMatchObject({
      report: {
        format: 'qsp',
        issues: [
          expect.objectContaining({
            severity: 'error',
            code: 'import_execution_failed',
          }),
        ],
      },
    });
  });

  it('keeps only one active worker import', async () => {
    const service = new QspImportWorkerService();
    const first = service.run(textSource());

    await expect(service.run(textSource())).rejects.toBeInstanceOf(ServiceUnavailableException);

    workers[0].emit('message', { type: 'result', result: emptyResult() });
    await expect(first).resolves.toEqual(emptyResult());
  });

  it('terminates active workers during graceful shutdown', async () => {
    const service = new QspImportWorkerService();
    const pending = service.run(textSource());

    const stopping = service.onModuleDestroy();
    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    workers[0].emit('exit', 1);

    await stopping;
    await expect(pending).resolves.toMatchObject({
      report: {
        issues: [expect.objectContaining({ code: 'import_execution_failed' })],
      },
    });
    await expect(service.run(textSource())).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
