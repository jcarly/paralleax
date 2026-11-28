import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BACKUP_LIFECYCLE,
  BackupError,
  attemptObjectKey,
  dailyObjectKey,
  hasRecentDailyBackup,
  shouldKeepWeeklyCopy,
  validateConfiguration,
  weeklyObjectKey,
} from './postgres-backup-policy.mjs';
import { MAX_BACKUP_DURATION_MS } from './postgres-backup-process.mjs';
import {
  createEncryptedArchive,
  createPlainArchive,
  encryptArchive,
  sha256File,
  validatePlainArchive,
  verifiedFileSize,
} from './postgres-backup-archive.mjs';
import { createS3Storage } from './postgres-backup-s3.mjs';

export {
  BACKUP_LIFECYCLE,
  BACKUP_RETENTION,
  BackupError,
  attemptObjectKey,
  dailyObjectKey,
  hasRecentDailyBackup,
  shouldKeepWeeklyCopy,
  validateConfiguration,
  weeklyObjectKey,
} from './postgres-backup-policy.mjs';
export { createS3Storage } from './postgres-backup-s3.mjs';

export {
  createPlainArchive,
  encryptArchive,
  validatePlainArchive,
} from './postgres-backup-archive.mjs';

function createMonitorPath(base, phase) {
  return new URL(`${base.pathname.replace(/\/+$/, '')}/${phase}`, base.origin);
}

async function sendHeartbeat(fetchRequest, url, signal) {
  let response;
  try {
    response = await fetchRequest(url, {
      method: 'GET',
      cache: 'no-store',
      signal: signal
        ? globalThis.AbortSignal.any([signal, globalThis.AbortSignal.timeout(5000)])
        : globalThis.AbortSignal.timeout(5000),
    });
  } catch {
    throw new BackupError('External backup monitor ping failed', 'MONITOR_UNAVAILABLE');
  }
  if (!response.ok) {
    throw new BackupError('External backup monitor ping failed', 'MONITOR_UNAVAILABLE');
  }
}

export function createHeartbeat(heartbeatUrl, { fetchRequest = fetch } = {}) {
  const base = new URL(heartbeatUrl);
  return {
    fail: () => sendHeartbeat(fetchRequest, createMonitorPath(base, 'fail')),
    success: ({ signal } = {}) => sendHeartbeat(fetchRequest, base, signal),
  };
}

function logEvent(level, event, values = {}) {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...values })}\n`,
  );
}

async function verifyRemoteObject({ storage, key, path, sha256, size, signal }) {
  await storage.get({ key, path, signal });
  const remoteSize = await verifiedFileSize(path);
  const remoteHash = await sha256File(path);
  await rm(path, { force: true });
  if (remoteSize !== size || remoteHash !== sha256) {
    throw new BackupError('Remote backup integrity check failed', 'REMOTE_INTEGRITY_FAILED');
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

async function requireVersioning(storage, signal) {
  if (typeof storage.getBucketVersioning !== 'function') {
    throw new BackupError('S3 bucket versioning could not be verified', 'S3_VERSIONING_REQUIRED');
  }
  let status;
  try {
    status = await storage.getBucketVersioning({ signal });
  } catch {
    throw new BackupError(
      'S3 bucket versioning could not be verified',
      'S3_VERSIONING_CHECK_FAILED',
    );
  }
  if (status !== 'Enabled') {
    throw new BackupError('S3 bucket versioning must be enabled', 'S3_VERSIONING_REQUIRED');
  }
}

async function readPreviousBackupFreshness({ storage, now, signal }) {
  try {
    return {
      recent: hasRecentDailyBackup(await storage.list('daily/', { signal }), now),
      code: null,
    };
  } catch {
    return { recent: false, code: 'S3_LIST_FAILED' };
  }
}

async function checkPreviousBackup({ storage, heartbeat, now, signal }) {
  const freshness = await readPreviousBackupFreshness({ storage, now, signal });
  if (freshness.code) {
    logEvent('warning', 'previous_backup_check_failed', { code: freshness.code });
  }
  const recent = freshness.recent;
  if (!recent) {
    logEvent('warning', 'previous_backup_missing_or_stale', { code: 'BACKUP_STALE' });
    try {
      await heartbeat.fail();
    } catch {
      logEvent('warning', 'external_monitor_unavailable', { code: 'MONITOR_UNAVAILABLE' });
    }
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
  attemptId,
  storage,
  heartbeat,
  temporaryDirectory,
  createArchive,
  validateArchive,
  encrypt,
}) {
  await requireVersioning(storage, signal);
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
  const stagingKey = attemptObjectKey(now, attemptId);
  await uploadAndVerify({ storage, keys: [stagingKey], archive, temporaryDirectory, signal });
  const keys = objectKeysForDate(now);
  await uploadAndVerify({ storage, keys, archive, temporaryDirectory, signal });
  return {
    attemptId,
    keys,
    size: archive.size,
    previousBackupFresh,
    retention: BACKUP_LIFECYCLE,
    verified: true,
  };
}

function publicFailure(error, signal) {
  if (signal?.aborted) {
    if (signal.reason instanceof BackupError) {
      return signal.reason;
    }
    const timeout = signal.reason?.name === 'TimeoutError';
    return new BackupError('Backup interrupted', timeout ? 'BACKUP_TIMEOUT' : 'BACKUP_INTERRUPTED');
  }
  return error instanceof BackupError ? error : new BackupError('Backup batch failed');
}

async function reportFailure(heartbeat) {
  try {
    await heartbeat.fail();
    return true;
  } catch {
    return false;
  }
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

async function runBatchOperation({ signal, execute }) {
  let result;
  let failure;
  try {
    if (signal?.aborted) {
      throw publicFailure(null, signal);
    }
    result = await execute();
  } catch (error) {
    failure = publicFailure(error, signal);
  }
  return { result, failure };
}

async function reportExecutionFailure(failure, heartbeat) {
  failure.monitorUnavailable = !(await reportFailure(heartbeat));
  return { failure };
}

async function reportExecutionSuccess({ result, heartbeat, signal }) {
  try {
    if (signal?.aborted) {
      throw publicFailure(null, signal);
    }
    await heartbeat.success({ signal });
    if (signal?.aborted) {
      throw publicFailure(null, signal);
    }
    return { result };
  } catch (error) {
    let failure = publicFailure(error, signal);
    if (!signal?.aborted && failure.code === 'BACKUP_FAILED') {
      failure = new BackupError(
        'External backup monitor acknowledgement failed',
        'MONITOR_UNAVAILABLE',
      );
    }
    return reportExecutionFailure(failure, heartbeat);
  }
}

async function executeAndClean({ temporaryDirectory, heartbeat, signal, execute }) {
  const outcome = await runBatchOperation({ signal, execute });
  if (!(await removeTemporaryDirectory(temporaryDirectory))) {
    outcome.failure = new BackupError(
      'Temporary backup cleanup failed',
      'TEMPORARY_CLEANUP_FAILED',
    );
  }
  if (outcome.failure) {
    return reportExecutionFailure(outcome.failure, heartbeat);
  }
  return reportExecutionSuccess({ ...outcome, heartbeat, signal });
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
    attemptId: options.attemptId ?? globalThis.crypto.randomUUID(),
  };
}

export async function runBackupBatch(options = {}) {
  const context = resolveRunContext(options);
  const batchController = createBatchController(context.signal, options.timeoutMs);
  try {
    return await executeBatchWithCleanup(context, batchController.signal);
  } finally {
    batchController.dispose();
  }
}

function createBatchController(parentSignal, timeoutMs = MAX_BACKUP_DURATION_MS) {
  const controller = new globalThis.AbortController();
  const timeout = globalThis.setTimeout(
    () =>
      controller.abort(new BackupError('Backup exceeded its maximum duration', 'BACKUP_TIMEOUT')),
    timeoutMs,
  );
  const onAbort = () =>
    controller.abort(new BackupError('Backup interrupted', 'BACKUP_INTERRUPTED'));
  parentSignal?.addEventListener('abort', onAbort, { once: true });
  if (parentSignal?.aborted) {
    onAbort();
  }
  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', onAbort);
    },
  };
}

async function executeBatchWithCleanup(context, signal) {
  const temporaryDirectory = await createPrivateTemporaryDirectory({
    create: context.createTemporaryDirectory,
    root: context.temporaryRoot,
    heartbeat: context.heartbeat,
  });
  const outcome = await executeAndClean({
    temporaryDirectory,
    heartbeat: context.heartbeat,
    signal,
    execute: () => executeBackupBatchWithContext(context, signal, temporaryDirectory),
  });
  if (outcome.failure) {
    throw outcome.failure;
  }
  return outcome.result;
}

function executeBackupBatchWithContext(context, signal, temporaryDirectory) {
  return executeBackupBatch({
    configuration: context.configuration,
    environment: context.environment,
    signal,
    now: context.runDate,
    attemptId: context.attemptId,
    storage: context.storage,
    heartbeat: context.heartbeat,
    temporaryDirectory,
    createArchive: context.createArchive,
    validateArchive: context.validateArchive,
    encrypt: context.encrypt,
  });
}
