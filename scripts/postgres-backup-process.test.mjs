import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runBackupBatch } from './postgres-backup-batch.mjs';
import { isProcessGroupRunning, runQuietly } from './postgres-backup-process.mjs';
import { classifyS3Failure } from './postgres-backup-s3.mjs';

const commandEnvironment = { PATH: process.env.PATH };
const batchEnvironment = {
  BACKUP_DATABASE_URL: 'postgres://synthetic:secret@127.0.0.1/source',
  AGE_RECIPIENT: 'age1syntheticpublicrecipient',
  S3_ENDPOINT: 'https://s3.example.test',
  S3_BUCKET: 'synthetic-private-bucket',
  S3_REGION: 'test-region-1',
  AWS_ACCESS_KEY_ID: 'synthetic-access-key',
  AWS_SECRET_ACCESS_KEY: 'synthetic-s3-secret',
  BACKUP_HEARTBEAT_URL: 'https://monitor.example.test/private-token',
};

function childTreeArguments(markerPath, pidPath) {
  const grandchild = [
    "const fs = require('node:fs');",
    "process.on('SIGTERM', () => {});",
    `setInterval(() => fs.appendFileSync(${JSON.stringify(markerPath)}, '.'), 10);`,
  ].join('');
  const parent = [
    "const { spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' });`,
    `fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
    "process.on('SIGTERM', () => process.exit(0));",
    'setInterval(() => {}, 1000);',
  ].join('');
  return ['-e', parent];
}

async function waitForFile(path) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const exists = await stat(path).then(
      () => true,
      () => false,
    );
    if (exists) {
      return;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  }
  assert.fail('The synthetic child process did not start');
}

async function assertGroupStopped(processId) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isProcessGroupRunning(processId)) {
      return;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  }
  assert.fail('The synthetic process group is still running');
}

async function runTerminatedChildTree(t, { timeoutMs, signal } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'paralleax-process-test-'));
  const markerPath = join(root, 'descendant.marker');
  const pidPath = join(root, 'parent.pid');
  t.after(() => rm(root, { recursive: true, force: true }));

  const command = runQuietly(process.execPath, childTreeArguments(markerPath, pidPath), {
    environment: commandEnvironment,
    signal,
    operation: 'Synthetic child tree',
    timeoutMs,
    killGraceMs: 40,
  });
  await waitForFile(pidPath);
  await waitForFile(markerPath);
  const processId = Number(await readFile(pidPath, 'utf8'));
  return { command, markerPath, processId };
}

function createRealChildArchive({
  markerPath,
  pidPath,
  reportChildStarted,
  reportTemporaryDirectory,
}) {
  return async ({ output, signal }) => {
    reportTemporaryDirectory(dirname(output));
    const command = runQuietly(process.execPath, childTreeArguments(markerPath, pidPath), {
      environment: commandEnvironment,
      signal,
      operation: 'Synthetic PostgreSQL dump',
      timeoutMs: 5000,
      killGraceMs: 40,
    });
    await waitForFile(pidPath);
    await waitForFile(markerPath);
    reportChildStarted(Number(await readFile(pidPath, 'utf8')));
    await command;
  };
}

function createBatchStorage() {
  return {
    async getBucketVersioning() {
      return 'Enabled';
    },
    async list() {
      return [
        {
          key: 'daily/2026-11-28.dump.age',
          lastModified: '2026-11-28T02:00:00.000Z',
        },
      ];
    },
  };
}

function deferred() {
  let resolve;
  return {
    promise: new Promise((complete) => {
      resolve = complete;
    }),
    resolve(value) {
      resolve(value);
    },
  };
}

test('real child process descendants stop before an interrupted command settles', async (t) => {
  const controller = new globalThis.AbortController();
  const { command, markerPath, processId } = await runTerminatedChildTree(t, {
    signal: controller.signal,
    timeoutMs: 5000,
  });
  const outcome = assert.rejects(command, (error) => error.code === 'BACKUP_INTERRUPTED');
  controller.abort();
  await outcome;
  await assertGroupStopped(processId);

  const stoppedSize = (await stat(markerPath)).size;
  await new Promise((resolve) => globalThis.setTimeout(resolve, 60));
  assert.equal((await stat(markerPath)).size, stoppedSize);
});

test('real child process descendants stop after the maximum command duration', async (t) => {
  const { command, markerPath, processId } = await runTerminatedChildTree(t, { timeoutMs: 500 });
  await assert.rejects(command, (error) => error.code === 'PROCESS_TIMEOUT');
  await assertGroupStopped(processId);

  const stoppedSize = (await stat(markerPath)).size;
  await new Promise((resolve) => globalThis.setTimeout(resolve, 60));
  assert.equal((await stat(markerPath)).size, stoppedSize);
});

test('child process launch errors expose a safe structured error code', async () => {
  await assert.rejects(
    runQuietly('/definitely/not/a/command', [], {
      environment: commandEnvironment,
      operation: 'Synthetic command',
    }),
    (error) => error.code === 'PROCESS_START_FAILED' && !error.message.includes('/definitely'),
  );
});

test('real child stderr is reduced to an allowlisted S3 error code', async () => {
  const privateDiagnostic =
    'upload failed for synthetic-object: private-access-key ' +
    'An error occurred (InvalidAccessKeyId) when calling the PutObject operation';
  const command = runQuietly(
    process.execPath,
    ['-e', `process.stderr.write(${JSON.stringify(privateDiagnostic)}); process.exitCode = 1;`],
    {
      environment: commandEnvironment,
      operation: 'Synthetic S3 upload',
      errorCode: 'S3_UPLOAD_FAILED',
      failureCodeFromStderr: (stderr) => classifyS3Failure(stderr, 'S3_UPLOAD_FAILED'),
    },
  );

  await assert.rejects(
    command,
    (error) =>
      error.code === 'S3_UPLOAD_INVALID_ACCESS_KEY' &&
      !error.message.includes('private-access-key') &&
      !error.message.includes('synthetic-object'),
  );
});

test('batch cleanup waits until a real archive process tree has stopped', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'paralleax-batch-child-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const markerPath = join(root, 'descendant.marker');
  const pidPath = join(root, 'parent.pid');
  const childStarted = deferred();
  let successReported = false;
  let temporaryDirectory;
  const batch = runBackupBatch({
    environment: batchEnvironment,
    now: new Date('2026-11-29T02:00:00.000Z'),
    attemptId: 'real-child-test',
    timeoutMs: 1000,
    temporaryRoot: root,
    storage: createBatchStorage(),
    heartbeat: {
      async fail() {},
      async success() {
        successReported = true;
      },
    },
    createArchive: createRealChildArchive({
      markerPath,
      pidPath,
      reportChildStarted: childStarted.resolve,
      reportTemporaryDirectory(value) {
        temporaryDirectory = value;
      },
    }),
    async validateArchive() {},
    async encrypt() {},
  });
  const processId = await childStarted.promise;
  await assert.rejects(batch, (error) => error.code === 'BACKUP_TIMEOUT');
  await assertGroupStopped(processId);
  await assert.rejects(stat(temporaryDirectory), (error) => error.code === 'ENOENT');
  assert.equal(successReported, false);
  const stoppedSize = (await stat(markerPath)).size;
  await new Promise((resolve) => globalThis.setTimeout(resolve, 60));
  assert.equal((await stat(markerPath)).size, stoppedSize);
});
