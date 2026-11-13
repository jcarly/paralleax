import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';

import { importQsp, type QspImportSource, type QspLocationSourceFile } from '@paralleax/shared';

import { ImportReportWriter } from '../../imports/import-report-writer.js';
import type { QspWorkerInput, QspWorkerMessage } from './qsp-import.worker-protocol.js';

const port = parentPort;

if (!port) {
  throw new Error('QSP worker must run in a worker thread.');
}

const input = readQspWorkerInput(workerData);
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

function readQspWorkerInput(value: unknown): QspWorkerInput {
  if (
    !isRecord(value) ||
    !isQspImportSource(value.source) ||
    typeof value.storyId !== 'string' ||
    typeof value.timestamp !== 'string' ||
    typeof value.reportPath !== 'string'
  ) {
    throw new TypeError('Invalid QSP worker input.');
  }
  return {
    source: value.source,
    storyId: value.storyId,
    timestamp: value.timestamp,
    reportPath: value.reportPath,
  };
}

function isQspImportSource(value: unknown): value is QspImportSource {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return false;
  }
  if (value.format === 'binary') {
    return value.content instanceof ArrayBuffer;
  }
  if (value.format === 'text') {
    return typeof value.content === 'string';
  }
  return (
    value.format === 'locations' &&
    Array.isArray(value.content) &&
    value.content.every(isQspLocationSourceFile)
  );
}

function isQspLocationSourceFile(value: unknown): value is QspLocationSourceFile {
  return isRecord(value) && typeof value.name === 'string' && typeof value.content === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
