import { Worker } from 'node:worker_threads';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerPath = resolve(repositoryRoot, 'apps/api/dist/qsp-import.worker.js');

const worker = new Worker(workerPath, {
  workerData: {
    source: {
      name: 'smoke.qsps',
      format: 'text',
      content: "# Start\n'Hello'\n--- Start ---",
    },
    storyId: 'story-smoke-test',
    timestamp: new Date().toISOString(),
  },
});

let success = false;

worker.on('message', (message) => {
  if (message.type === 'progress') {
    const { phase, completed, total } = message.progress;

    console.log(`${phase}: ${completed}/${total ?? '?'}`);
    return;
  }

  if (message.type === 'error') {
    console.error('Worker error:', message.message);
    process.exitCode = 1;
    return;
  }

  if (message.type === 'result') {
    const count = message.result.story?.interactions.length;

    if (count !== 1) {
      console.error('Unexpected import result:', message.result.report);
      process.exitCode = 1;
      return;
    }

    success = true;
    console.log('Worker import successful!');
  }
});

worker.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

worker.on('exit', (code) => {
  if (code !== 0 || !success) {
    console.error(`Worker exited with code ${code}`);
    process.exitCode = 1;
  }
});
