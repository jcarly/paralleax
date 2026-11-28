import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_RETENTION,
  BackupError,
  dailyObjectKey,
  expiredObjectKeys,
  hasRecentDailyBackup,
  shouldKeepWeeklyCopy,
  validateConfiguration,
  weeklyObjectKey,
} from './postgres-backup-policy.mjs';
import {
  ageCommandEnvironment,
  databaseCommandEnvironment,
  runQuietly,
} from './postgres-backup-process.mjs';
import { createS3Storage } from './postgres-backup-s3.mjs';

export {
  BACKUP_RETENTION,
  BackupError,
  dailyObjectKey,
  expiredObjectKeys,
  hasRecentDailyBackup,
  shouldKeepWeeklyCopy,
  validateConfiguration,
  weeklyObjectKey,
} from './postgres-backup-policy.mjs';
export { createS3Storage } from './postgres-backup-s3.mjs';

export async function createPlainArchive({
  output,
  configuration,
  environment,
  signal,
  run = runQuietly,
}) {
  await run('npm', ['run', 'db:backup', '--', `--output=${output}`], {
    environment: databaseCommandEnvironment(environment, configuration.databaseUrl),
    signal,
    operation: 'PostgreSQL backup creation',
  });
}

export async function validatePlainArchive({ path, environment, signal, run = runQuietly }) {
  await run('pg_restore', ['--list', path], {
    environment: ageCommandEnvironment(environment),
    signal,
    operation: 'PostgreSQL archive validation',
  });
}

export async function encryptArchive({
  input,
  output,
  recipient,
  environment,
  signal,
  run = runQuietly,
}) {
  await run('age', ['--encrypt', '--recipient', recipient, '--output', output, input], {
    environment: ageCommandEnvironment(environment),
    signal,
    operation: 'Age encryption',
  });
}

function createMonitorPath(base, phase) {
  return new URL(`${base.pathname.replace(/\/+$/, '')}/${phase}`, base.origin);
}

async function sendHeartbeat(fetchRequest, url) {
  let response;
  try {
    response = await fetchRequest(url, {
      method: 'GET',
      cache: 'no-store',
      signal: globalThis.AbortSignal.timeout(5000),
    });
  } catch {
    throw new BackupError('External backup monitor ping failed');
  }
  if (!response.ok) {
    throw new BackupError('External backup monitor ping failed');
  }
}

export function createHeartbeat(heartbeatUrl, { fetchRequest = fetch } = {}) {
  const base = new URL(heartbeatUrl);
  return {
    fail: () => sendHeartbeat(fetchRequest, createMonitorPath(base, 'fail')),
    success: () => sendHeartbeat(fetchRequest, base),
  };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  } catch {
    throw new BackupError('Backup integrity check failed');
  }
}

async function verifiedFileSize(path) {
  try {
    const details = await stat(path);
    if (!details.isFile() || details.size === 0) {
      throw new BackupError('Backup integrity check failed');
    }
    return details.size;
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError('Backup integrity check failed');
  }
}

async function createEncryptedArchive({
  temporaryDirectory,
  configuration,
  environment,
  signal,
  createArchive,
  validateArchive,
  encrypt,
}) {
  const archivePath = join(temporaryDirectory, 'backup.dump');
  const encryptedPath = join(temporaryDirectory, 'backup.dump.age');
  await createArchive({ output: archivePath, configuration, environment, signal });
  await chmod(archivePath, 0o600);
  await validateArchive({ path: archivePath, environment, signal });
  await encrypt({
    input: archivePath,
    output: encryptedPath,
    recipient: configuration.recipient,
    environment,
    signal,
  });
  await chmod(encryptedPath, 0o600);

  return {
    path: encryptedPath,
    size: await verifiedFileSize(encryptedPath),
    sha256: await sha256File(encryptedPath),
  };
}

async function verifyRemoteObject({ storage, key, path, sha256, size, signal }) {
  await storage.get({ key, path, signal });
  const remoteSize = await verifiedFileSize(path);
  const remoteHash = await sha256File(path);
  await rm(path, { force: true });
  if (remoteSize !== size || remoteHash !== sha256) {
    throw new BackupError('Remote backup integrity check failed');
  }
}

async function uploadAndVerify({ storage, keys, archive, temporaryDirectory, signal }) {
  const remotePath = join(temporaryDirectory, 'remote-check.dump.age');
  for (const key of keys) {
    await storage.put({ path: archive.path, key, sha256: archive.sha256, signal });
    await verifyRemoteObject({
      storage,
      key,
      path: remotePath,
      sha256: archive.sha256,
      size: archive.size,
      signal,
    });
  }
}

async function prunePrefix({ storage, prefix, limit, signal }) {
  let objects;
  try {
    objects = await storage.list(prefix, { signal });
  } catch {
    throw new BackupError('S3 retention check failed');
  }

  for (const key of expiredObjectKeys(objects, prefix, limit)) {
    try {
      await storage.delete(key, { signal });
    } catch {
      throw new BackupError('S3 retention deletion failed');
    }
  }
}

async function applyRetention({ storage, signal }) {
  await prunePrefix({ storage, prefix: 'daily/', limit: BACKUP_RETENTION.daily, signal });
  await prunePrefix({ storage, prefix: 'weekly/', limit: BACKUP_RETENTION.weekly, signal });
}

async function readPreviousBackupFreshness({ storage, now, signal }) {
  try {
    return hasRecentDailyBackup(await storage.list('daily/', { signal }), now);
  } catch {
    return false;
  }
}

async function checkPreviousBackup({ storage, heartbeat, now, signal }) {
  const recent = await readPreviousBackupFreshness({ storage, now, signal });
  if (!recent) {
    await heartbeat.fail().catch(() => {});
  }
  return recent;
}

function objectKeysForDate(date) {
  const keys = [dailyObjectKey(date)];
  if (shouldKeepWeeklyCopy(date)) {
    keys.push(weeklyObjectKey(date));
  }
  return keys;
}

async function executeBackupBatch({
  configuration,
  environment,
  signal,
  now,
  storage,
  heartbeat,
  temporaryDirectory,
  createArchive,
  validateArchive,
  encrypt,
}) {
  const previousBackupFresh = await checkPreviousBackup({ storage, heartbeat, now, signal });
  const archive = await createEncryptedArchive({
    temporaryDirectory,
    configuration,
    environment,
    signal,
    createArchive,
    validateArchive,
    encrypt,
  });
  const keys = objectKeysForDate(now);
  await uploadAndVerify({ storage, keys, archive, temporaryDirectory, signal });
  await applyRetention({ storage, signal });
  return { keys, size: archive.size, previousBackupFresh, verified: true };
}

function publicFailure(error, signal) {
  if (signal?.aborted) {
    return new BackupError('Backup interrupted');
  }
  return error instanceof BackupError ? error : new BackupError('Backup batch failed');
}

async function reportFailure(heartbeat) {
  await heartbeat.fail().catch(() => {});
}

async function removeTemporaryDirectory(path) {
  try {
    await rm(path, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function createPrivateTemporaryDirectory({ create, root, heartbeat }) {
  let path;
  try {
    path = await create(join(root, 'paralleax-postgres-backup-'));
    await chmod(path, 0o700);
    return path;
  } catch {
    if (path) {
      await removeTemporaryDirectory(path);
    }
    await reportFailure(heartbeat);
    throw new BackupError('Temporary backup setup failed');
  }
}

async function executeAndClean({ temporaryDirectory, heartbeat, signal, execute }) {
  let result;
  let failure;
  try {
    result = await execute();
  } catch (error) {
    failure = publicFailure(error, signal);
  }

  if (!(await removeTemporaryDirectory(temporaryDirectory))) {
    failure = new BackupError('Temporary backup cleanup failed');
  }
  if (failure) {
    await reportFailure(heartbeat);
    return { failure };
  }

  try {
    await heartbeat.success();
    return { result };
  } catch {
    await reportFailure(heartbeat);
    return { failure: new BackupError('External backup monitor acknowledgement failed') };
  }
}

function parseRunDate(value) {
  const runDate = new Date(value ?? new Date());
  if (!Number.isFinite(runDate.getTime())) {
    throw new BackupError('Backup date is invalid');
  }
  return runDate;
}

function resolveBatchResources(options, environment, configuration) {
  return {
    storage: options.storage ?? createS3Storage(configuration, { environment }),
    heartbeat: options.heartbeat ?? createHeartbeat(configuration.heartbeatUrl),
    signal: options.signal,
    createArchive: options.createArchive ?? createPlainArchive,
    validateArchive: options.validateArchive ?? validatePlainArchive,
    encrypt: options.encrypt ?? encryptArchive,
    createTemporaryDirectory: options.createTemporaryDirectory ?? mkdtemp,
    temporaryRoot: options.temporaryRoot ?? tmpdir(),
  };
}

function resolveRunContext(options) {
  const environment = options.environment ?? process.env;
  const configuration = validateConfiguration(environment);
  return {
    environment,
    configuration,
    ...resolveBatchResources(options, environment, configuration),
    runDate: parseRunDate(options.now),
  };
}

export async function runBackupBatch(options = {}) {
  const context = resolveRunContext(options);
  const temporaryDirectory = await createPrivateTemporaryDirectory({
    create: context.createTemporaryDirectory,
    root: context.temporaryRoot,
    heartbeat: context.heartbeat,
  });
  const outcome = await executeAndClean({
    temporaryDirectory,
    heartbeat: context.heartbeat,
    signal: context.signal,
    execute: () =>
      executeBackupBatch({
        configuration: context.configuration,
        environment: context.environment,
        signal: context.signal,
        now: context.runDate,
        storage: context.storage,
        heartbeat: context.heartbeat,
        temporaryDirectory,
        createArchive: context.createArchive,
        validateArchive: context.validateArchive,
        encrypt: context.encrypt,
      }),
  });
  if (outcome.failure) {
    throw outcome.failure;
  }
  return outcome.result;
}

async function main() {
  const controller = new globalThis.AbortController();
  let interruptedBy;
  const interrupt = (signal) => {
    interruptedBy ??= signal;
    controller.abort();
  };
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    const result = await runBackupBatch({ signal: controller.signal });
    process.stdout.write(
      `[postgres-backup] verified ${result.keys.join(', ')} (${result.size} bytes); ` +
        `previous=${result.previousBackupFresh ? 'fresh' : 'missing-or-stale'}\n`,
    );
  } catch {
    const interruption = interruptedBy ? ` after ${interruptedBy}` : '';
    process.stderr.write(`[postgres-backup] failed${interruption}; external alert requested\n`);
    process.exitCode = interruptedBy === 'SIGINT' ? 130 : interruptedBy === 'SIGTERM' ? 143 : 1;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
