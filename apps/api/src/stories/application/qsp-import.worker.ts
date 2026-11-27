import { randomUUID } from 'node:crypto';
import { ImportIssuePreview } from './import-issue-preview.js';
import { parentPort, workerData } from 'node:worker_threads';

import { importQsp, type QspImportSource, type QspLocationSourceFile } from '@paralleax/shared';

import type { QspWorkerInput, QspWorkerMessage } from './qsp-import.worker-protocol.js';

const port = parentPort;

if (!port) {
  throw new Error('QSP worker must run in a worker thread.');
}

const input = readQspWorkerInput(workerData);

void (async () => {
  try {
    const preview = new ImportIssuePreview();
    const result = importQsp(input.source, {
      storyId: input.storyId,
      timestamp: input.timestamp,
      createId: randomUUID,
      maxPreviewIssues: 0,
      onIssue: preview.capture,
      onProgress: (progress) => {
        port.postMessage({ type: 'progress', progress } satisfies QspWorkerMessage);
      },
    });
    result.report.issues = preview.snapshot();
    port.postMessage({ type: 'result', result } satisfies QspWorkerMessage);
  } catch (caught) {
    port.postMessage({
      type: 'error',
      message: caught instanceof Error ? caught.message : String(caught),
    } satisfies QspWorkerMessage);
  }
})();

function readQspWorkerInput(value: unknown): QspWorkerInput {
  if (
    !isRecord(value) ||
    !isQspImportSource(value.source) ||
    typeof value.storyId !== 'string' ||
    typeof value.timestamp !== 'string'
  ) {
    throw new TypeError('Invalid QSP worker input.');
  }
  return {
    source: value.source,
    storyId: value.storyId,
    timestamp: value.timestamp,
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
