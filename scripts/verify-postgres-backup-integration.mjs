import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupError } from './postgres-backup-policy.mjs';
import {
  POSTGRES_IMAGE,
  S3MOCK_IMAGE,
  createAgeRecipient,
  downloadEncryptedObject,
  publishedPort,
  removeContainer,
  runAws,
  runBackupContainer,
  runDocker,
  runRestoreAndReadData,
  startHeartbeatServer,
  waitForPostgres,
  waitForS3,
  writeEnvironmentFile,
} from './postgres-backup-integration-support.mjs';

const BACKUP_BUCKET = 'paralleax-backup-integration';

function logEvent(level, event, code) {
  const output = level === 'error' ? process.stderr : process.stdout;
  output.write(`${JSON.stringify({ level, event, ...(code ? { code } : {}) })}\n`);
}

function createContainerNames() {
  return {
    postgres: `paralleax-backup-pg-${randomUUID().slice(0, 8)}`,
    s3: `paralleax-backup-s3-${randomUUID().slice(0, 8)}`,
  };
}

async function startServiceContainers({ names, postgresEnvironmentPath, signal }) {
  const results = await Promise.allSettled([
    runDocker(
      [
        'run',
        '--detach',
        '--name',
        names.postgres,
        '--env-file',
        postgresEnvironmentPath,
        '--publish',
        '127.0.0.1::5432',
        POSTGRES_IMAGE,
      ],
      { signal },
    ),
    runDocker(
      ['run', '--detach', '--name', names.s3, '--publish', '127.0.0.1::9090', S3MOCK_IMAGE],
      { signal },
    ),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    throw failure.reason;
  }
  const databasePort = await publishedPort(names.postgres, '5432/tcp', signal);
  const s3Port = await publishedPort(names.s3, '9090/tcp', signal);
  return { databasePort, endpoint: `http://127.0.0.1:${s3Port}` };
}

async function seedSyntheticDatabases(postgresName, signal) {
  await runDocker(
    [
      'exec',
      postgresName,
      'psql',
      '--username=backup_test',
      '--dbname=source_db',
      '--set=ON_ERROR_STOP=1',
      "--command=CREATE TABLE synthetic_backup_rows (id integer PRIMARY KEY, payload text NOT NULL); INSERT INTO synthetic_backup_rows VALUES (1, 'synthetic-alpha'), (2, 'synthetic-beta');",
    ],
    { signal },
  );
  await runDocker(['exec', postgresName, 'createdb', '--username=backup_test', 'restore_db'], {
    signal,
  });
}

async function createBucket({ s3EnvironmentPath, endpoint, signal }) {
  await runAws(
    s3EnvironmentPath,
    [
      's3api',
      'create-bucket',
      '--bucket',
      BACKUP_BUCKET,
      '--endpoint-url',
      endpoint,
      '--region',
      'test-region-1',
    ],
    signal,
  );
}

async function setBucketVersioning({ s3EnvironmentPath, endpoint, signal }) {
  await runAws(
    s3EnvironmentPath,
    [
      's3api',
      'put-bucket-versioning',
      '--bucket',
      BACKUP_BUCKET,
      '--versioning-configuration',
      'Status=Enabled',
      '--endpoint-url',
      endpoint,
      '--region',
      'test-region-1',
    ],
    signal,
  );
}

async function verifyBucketVersioning({ s3EnvironmentPath, endpoint, signal }) {
  const result = await runAws(
    s3EnvironmentPath,
    [
      's3api',
      'get-bucket-versioning',
      '--bucket',
      BACKUP_BUCKET,
      '--endpoint-url',
      endpoint,
      '--region',
      'test-region-1',
      '--output',
      'json',
    ],
    signal,
    true,
  );
  if (JSON.parse(result).Status !== 'Enabled') {
    throw new BackupError(
      'Synthetic S3 versioning was not enabled',
      'INTEGRATION_VERSIONING_FAILED',
    );
  }
}

async function enableBucketVersioning(options) {
  await createBucket(options);
  await setBucketVersioning(options);
  await verifyBucketVersioning(options);
}

async function listDailyObject({ s3EnvironmentPath, endpoint, signal }) {
  const result = await runAws(
    s3EnvironmentPath,
    [
      's3api',
      'list-objects-v2',
      '--bucket',
      BACKUP_BUCKET,
      '--prefix',
      'daily/',
      '--endpoint-url',
      endpoint,
      '--region',
      'test-region-1',
      '--output',
      'json',
    ],
    signal,
    true,
  );
  const objectKey = JSON.parse(result).Contents?.[0]?.Key;
  if (!objectKey) {
    throw new BackupError('Synthetic S3 object was not found', 'INTEGRATION_OBJECT_MISSING');
  }
  return objectKey;
}

async function verifyObjectVersion({ s3EnvironmentPath, endpoint, objectKey, signal }) {
  const result = await runAws(
    s3EnvironmentPath,
    [
      's3api',
      'list-object-versions',
      '--bucket',
      BACKUP_BUCKET,
      '--prefix',
      objectKey,
      '--endpoint-url',
      endpoint,
      '--region',
      'test-region-1',
      '--output',
      'json',
    ],
    signal,
    true,
  );
  const versions = JSON.parse(result).Versions ?? [];
  const hasVersion = versions.some(
    (version) =>
      version.Key === objectKey &&
      version.IsLatest &&
      typeof version.VersionId === 'string' &&
      version.VersionId.length > 0 &&
      version.VersionId !== 'null',
  );
  if (!hasVersion) {
    throw new BackupError(
      'Synthetic object did not receive a version ID',
      'INTEGRATION_VERSIONING_FAILED',
    );
  }
}

async function restoreAndCheckRows({ workDirectory, restoreEnvironmentPath, signal }) {
  const output = await runRestoreAndReadData(workDirectory, restoreEnvironmentPath, signal);
  if (output.trim() !== '1:synthetic-alpha\n2:synthetic-beta') {
    throw new BackupError('Restored synthetic rows did not match', 'INTEGRATION_DATA_MISMATCH');
  }
}

async function prepareIntegration({ workDirectory, names, signal, heartbeatPort }) {
  const postgresEnvironmentPath = join(workDirectory, 'postgres.env');
  const s3EnvironmentPath = join(workDirectory, 's3.env');
  const backupEnvironmentPath = join(workDirectory, 'backup.env');
  const restoreEnvironmentPath = join(workDirectory, 'restore.env');
  const password = 'synthetic-backup-password';
  await writeEnvironmentFile(postgresEnvironmentPath, {
    POSTGRES_USER: 'backup_test',
    POSTGRES_PASSWORD: password,
    POSTGRES_DB: 'source_db',
  });
  await writeEnvironmentFile(s3EnvironmentPath, {
    AWS_ACCESS_KEY_ID: 'synthetic-access-key',
    AWS_SECRET_ACCESS_KEY: 'synthetic-secret-key',
    AWS_DEFAULT_REGION: 'test-region-1',
    AWS_EC2_METADATA_DISABLED: 'true',
  });

  const services = await startServiceContainers({ names, postgresEnvironmentPath, signal });
  await Promise.all([
    waitForPostgres(names.postgres, signal),
    waitForS3(services.endpoint, signal),
  ]);
  await seedSyntheticDatabases(names.postgres, signal);
  const recipient = await createAgeRecipient(workDirectory, signal);
  await enableBucketVersioning({ s3EnvironmentPath, endpoint: services.endpoint, signal });

  const databaseUrl = `postgresql://backup_test:${password}@127.0.0.1:${services.databasePort}/source_db?sslmode=disable`;
  const restoreUrl = `postgresql://backup_test:${password}@127.0.0.1:${services.databasePort}/restore_db?sslmode=disable`;
  await writeEnvironmentFile(backupEnvironmentPath, {
    BACKUP_DATABASE_URL: databaseUrl,
    AGE_RECIPIENT: recipient,
    S3_ENDPOINT: services.endpoint,
    S3_BUCKET: BACKUP_BUCKET,
    S3_REGION: 'test-region-1',
    AWS_ACCESS_KEY_ID: 'synthetic-access-key',
    AWS_SECRET_ACCESS_KEY: 'synthetic-secret-key',
    BACKUP_HEARTBEAT_URL: `http://127.0.0.1:${heartbeatPort}/monitor/synthetic-token`,
    BACKUP_TEST_ALLOW_LOOPBACK_HTTP: '1',
  });
  await writeEnvironmentFile(restoreEnvironmentPath, { RESTORE_DATABASE_URL: restoreUrl });
  return {
    endpoint: services.endpoint,
    s3EnvironmentPath,
    backupEnvironmentPath,
    restoreEnvironmentPath,
  };
}

async function verifyBackupPipeline({ workDirectory, setup, signal }) {
  await runBackupContainer(setup.backupEnvironmentPath, signal);
  const objectKey = await listDailyObject({
    s3EnvironmentPath: setup.s3EnvironmentPath,
    endpoint: setup.endpoint,
    signal,
  });
  await verifyObjectVersion({
    s3EnvironmentPath: setup.s3EnvironmentPath,
    endpoint: setup.endpoint,
    objectKey,
    signal,
  });
  await downloadEncryptedObject({
    workDirectory,
    environmentPath: setup.s3EnvironmentPath,
    bucket: BACKUP_BUCKET,
    key: objectKey,
    endpoint: setup.endpoint,
    signal,
  });
  await restoreAndCheckRows({
    workDirectory,
    restoreEnvironmentPath: setup.restoreEnvironmentPath,
    signal,
  });
}

async function executeIntegration({ signal, workDirectory, names }) {
  const heartbeatEvents = [];
  const heartbeat = await startHeartbeatServer(heartbeatEvents);
  try {
    const setup = await prepareIntegration({
      workDirectory,
      names,
      signal,
      heartbeatPort: heartbeat.port,
    });
    await verifyBackupPipeline({ workDirectory, setup, signal });
    if (
      !heartbeatEvents.includes('/monitor/synthetic-token/fail') ||
      !heartbeatEvents.includes('/monitor/synthetic-token')
    ) {
      throw new BackupError(
        'Synthetic heartbeat paths were not observed',
        'INTEGRATION_MONITOR_FAILED',
      );
    }
  } finally {
    await new Promise((resolve) => heartbeat.server.close(resolve));
  }
}

async function main() {
  const controller = new globalThis.AbortController();
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
    controller.abort(new BackupError('Integration interrupted', 'BACKUP_INTERRUPTED'));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const names = createContainerNames();
  let workDirectory;
  try {
    workDirectory = await mkdtemp(join(tmpdir(), 'paralleax-backup-integration-'));
    await chmod(workDirectory, 0o700);
    await executeIntegration({ signal: controller.signal, workDirectory, names });
    logEvent('info', 'synthetic_backup_restore_verified');
  } catch (error) {
    const code = error instanceof BackupError ? error.code : 'INTEGRATION_FAILED';
    logEvent('error', 'synthetic_backup_restore_failed', code);
    process.exitCode = interrupted ? 130 : 1;
  } finally {
    await Promise.all(Object.values(names).map(removeContainer));
    if (workDirectory) {
      await rm(workDirectory, { recursive: true, force: true });
    }
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

await main();
