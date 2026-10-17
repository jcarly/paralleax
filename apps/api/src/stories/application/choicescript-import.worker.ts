import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';

import { importChoiceScript, type ChoiceScriptImportResult } from '@paralleax/shared';

import { ImportReportWriter } from '../../imports/import-report-writer.js';
import type {
  ChoiceScriptWorkerInput,
  ChoiceScriptWorkerMessage,
} from './choicescript-import.worker-protocol.js';

const port = parentPort;

if (!port) {
  throw new Error('ChoiceScript worker must run in a worker thread.');
}

const input = workerData as ChoiceScriptWorkerInput;
const writer = new ImportReportWriter({ reportPath: input.reportPath });

void (async () => {
  try {
    await writer.start();
    let result: ChoiceScriptImportResult;
    try {
      result = importChoiceScript(input.files, {
        storyId: input.storyId,
        timestamp: input.timestamp,
        createId: randomUUID,
        maxPreviewIssues: 0,
        onIssue: (issue) => writer.writeIssue(issue),
      });
    } finally {
      await writer.close();
    }
    port.postMessage({ type: 'result', result } satisfies ChoiceScriptWorkerMessage);
  } catch (caught) {
    let error: unknown = caught;
    try {
      await writer.close();
    } catch (closeError) {
      error = new AggregateError([caught, closeError], 'ChoiceScript report finalization failed.');
    }
    port.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies ChoiceScriptWorkerMessage);
  }
})();
