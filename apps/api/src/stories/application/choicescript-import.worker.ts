import { randomUUID } from 'node:crypto';
import { ImportIssuePreview } from './import-issue-preview.js';
import { parentPort, workerData } from 'node:worker_threads';

import {
  importChoiceScript,
  type ChoiceScriptImportResult,
  type ChoiceScriptSourceFile,
} from '@paralleax/shared';

import type {
  ChoiceScriptWorkerInput,
  ChoiceScriptWorkerMessage,
} from './choicescript-import.worker-protocol.js';

const port = parentPort;

if (!port) {
  throw new Error('ChoiceScript worker must run in a worker thread.');
}

const input = parseChoiceScriptWorkerInput(workerData);

void (async () => {
  try {
    const preview = new ImportIssuePreview();
    const result: ChoiceScriptImportResult = importChoiceScript(input.files, {
      storyId: input.storyId,
      timestamp: input.timestamp,
      createId: randomUUID,
      maxPreviewIssues: 0,
      onIssue: preview.capture,
    });
    result.report.issues = preview.snapshot();
    port.postMessage({ type: 'result', result } satisfies ChoiceScriptWorkerMessage);
  } catch (caught) {
    port.postMessage({
      type: 'error',
      message: caught instanceof Error ? caught.message : String(caught),
    } satisfies ChoiceScriptWorkerMessage);
  }
})();

function parseChoiceScriptWorkerInput(value: unknown): ChoiceScriptWorkerInput {
  if (!isRecord(value)) {
    throw new Error('Invalid ChoiceScript worker input.');
  }
  const { files, storyId, timestamp } = value;
  if (
    typeof storyId !== 'string' ||
    typeof timestamp !== 'string' ||
    !Array.isArray(files) ||
    !files.every(isChoiceScriptSourceFile)
  ) {
    throw new Error('Invalid ChoiceScript worker input.');
  }
  return { files, storyId, timestamp };
}

function isChoiceScriptSourceFile(value: unknown): value is ChoiceScriptSourceFile {
  return isRecord(value) && typeof value.name === 'string' && typeof value.content === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
