import { EventEmitter } from 'node:events';
import type { ChoiceScriptImportResult, ChoiceScriptSourceFile } from '@paralleax/shared';

const mockWorkerConstructor = jest.fn();

jest.mock('node:worker_threads', () => ({ Worker: mockWorkerConstructor }));

import { ChoiceScriptImportWorkerService } from './choicescript-import-worker.service';

const reportPath = 'C:\\tmp\\choicescript-import-report.jsonl';

class TestWorker extends EventEmitter {
  readonly terminate = jest.fn(() => Promise.resolve(1));
}

const files: ChoiceScriptSourceFile[] = [{ name: 'startup.txt', content: '*finish' }];
const options = { storyId: 'story-1', timestamp: '2026-10-17T12:00:00.000Z' };

function emptyResult(): ChoiceScriptImportResult {
  return {
    report: {
      format: 'choicescript',
      sourceFileCount: 1,
      sceneCount: 1,
      interactionCount: 1,
      convertedCommandCount: 1,
      approximatedCommandCount: 0,
      ignoredCommandCount: 0,
      warningCount: 0,
      errorCount: 0,
      issues: [],
    },
  };
}

describe('ChoiceScriptImportWorkerService', () => {
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

  it('runs ChoiceScript in its worker and returns the import result', async () => {
    const service = new ChoiceScriptImportWorkerService();
    const pending = service.run(files, options, undefined, reportPath);

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.stringMatching(/choicescript-import\.worker\.js$/),
      { workerData: expect.objectContaining({ files, ...options, reportPath }), transferList: [] },
    );

    const result = emptyResult();
    workers[0].emit('message', { type: 'result', result });

    await expect(pending).resolves.toEqual(result);
  });

  it('terminates its worker when the import request is cancelled', async () => {
    const controller = new AbortController();
    const service = new ChoiceScriptImportWorkerService();
    const pending = service.run(files, options, controller.signal, reportPath);

    controller.abort();

    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toThrow('ChoiceScript import worker cancelled.');
  });
});
