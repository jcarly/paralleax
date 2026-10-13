import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';

import { importQsp } from '@paralleax/shared';

import type { QspWorkerInput, QspWorkerMessage } from './qsp-import.worker-protocol.js';

const port = parentPort;

if (!port) {
  throw new Error('QSP worker must run in a worker thread.');
}

try {
  const input = workerData as QspWorkerInput;

  const result = importQsp(input.source, {
    storyId: input.storyId,
    timestamp: input.timestamp,
    createId: randomUUID,

    onProgress: (progress) => {
      port.postMessage({
        type: 'progress',
        progress,
      } satisfies QspWorkerMessage);
    },
  });

  port.postMessage({
    type: 'result',
    result,
  } satisfies QspWorkerMessage);
} catch (error) {
  port.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : 'Unknown QSP import error',
  } satisfies QspWorkerMessage);
}
