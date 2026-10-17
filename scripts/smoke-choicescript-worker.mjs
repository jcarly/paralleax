import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = resolve(repositoryRoot, 'apps/api/dist/choicescript-import.worker.js');
const reportPath = join(tmpdir(), `paralleax-choicescript-smoke-${randomUUID()}.jsonl`);

const worker = new Worker(workerPath, {
  workerData: {
    files: [
      {
        name: 'startup.txt',
        content: '*title Worker smoke\nThe hall is quiet.\n*ending',
      },
    ],
    storyId: 'choicescript-worker-smoke',
    timestamp: new Date().toISOString(),
    reportPath,
  },
});

let success = false;

worker.on('message', (message) => {
  if (message.type === 'error') {
    console.error('ChoiceScript worker error:', message.message);
    process.exitCode = 1;
    return;
  }

  if (message.type === 'result') {
    const interactionCount = message.result.story?.interactions.length;
    if (interactionCount !== 1) {
      console.error('Unexpected ChoiceScript import result:', message.result.report);
      process.exitCode = 1;
      return;
    }

    success = true;
    console.log('ChoiceScript worker import successful.');
  }
});

worker.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

worker.on('exit', (code) => {
  rmSync(reportPath, { force: true });
  if (code !== 0 || !success) {
    console.error(`ChoiceScript worker exited with code ${code}`);
    process.exitCode = 1;
  }
});
