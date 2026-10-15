import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';

import { importQsp } from '@paralleax/shared';

import { ImportReportWriter } from '../../imports/import-report-writer.js';
import type { QspWorkerInput, QspWorkerMessage } from './qsp-import.worker-protocol.js';

const port = parentPort;

if (!port) {
  throw new Error('QSP worker must run in a worker thread.');
}

const input = workerData as QspWorkerInput;
const writer = new ImportReportWriter({ reportPath: input.reportPath });

void (async () => {
  try {
    await writer.start();
    let result;
    try {
      result = importQsp(input.source, {
        storyId: input.storyId,
        timestamp: input.timestamp,
        createId: randomUUID,
        maxPreviewIssues: 0,
        onIssue: (issue) => writer.writeIssue(issue),
        onProgress: (progress) => {
          port.postMessage({ type: 'progress', progress } satisfies QspWorkerMessage);
        },
      });
    } finally {
      await writer.close();
    }
    port.postMessage({ type: 'result', result } satisfies QspWorkerMessage);
  } catch (caught) {
    let error: unknown = caught;
    try {
      await writer.close();
    } catch (closeError) {
      error = new AggregateError([caught, closeError], 'QSP import report finalization failed.');
    }
    port.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies QspWorkerMessage);
  }
})();
