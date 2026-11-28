import { createServer } from 'node:http';
import { chmod, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { BackupError } from './postgres-backup-policy.mjs';
import { runQuietly, selectedEnvironment } from './postgres-backup-process.mjs';

export const BACKUP_IMAGE = process.env.BACKUP_TEST_IMAGE ?? 'paralleax-postgres-backup:ci';
export const POSTGRES_IMAGE = process.env.BACKUP_TEST_POSTGRES_IMAGE ?? 'postgres:18-bookworm';
export const S3MOCK_IMAGE = process.env.BACKUP_TEST_S3_IMAGE ?? 'adobe/s3mock:5.2.3';

const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;
const VOLUME_USER = `${process.getuid()}:${process.getgid()}`;

function dockerEnvironment() {
  return selectedEnvironment(process.env, [
    'PATH',
    'HOME',
    'TMPDIR',
    'DOCKER_CONFIG',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
  ]);
}

export function runDocker(
  args,
  {
    signal,
    captureOutput = false,
    tolerateFailure = false,
    errorCode = 'INTEGRATION_CONTAINER_FAILED',
  } = {},
) {
  return runQuietly('docker', args, {
    environment: dockerEnvironment(),
    signal,
    operation: 'Synthetic backup integration container',
    errorCode,
    captureOutput,
    timeoutMs: COMMAND_TIMEOUT_MS,
  }).catch((error) => {
    if (tolerateFailure && !signal?.aborted) {
      return null;
    }
    throw error;
  });
}

export async function writeEnvironmentFile(path, values) {
  const contents = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  await writeFile(path, `${contents}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function hostPort(value) {
  const match = value.trim().match(/:(\d+)$/);
  if (!match) {
    throw new BackupError(
      'Integration container did not publish a port',
      'INTEGRATION_PORT_FAILED',
    );
  }
  return Number(match[1]);
}

export async function publishedPort(containerName, port, signal) {
  const output = await runDocker(['port', containerName, port], {
    signal,
    captureOutput: true,
    errorCode: 'INTEGRATION_PORT_LOOKUP_FAILED',
  });
  return hostPort(output);
}

export async function waitForPostgres(containerName, signal) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !signal.aborted) {
    const result = await runDocker(
      ['exec', containerName, 'pg_isready', '--username=backup_test', '--dbname=source_db'],
      { signal, captureOutput: true, tolerateFailure: true },
    );
    if (result !== null) {
      return;
    }
    await wait(500, undefined, { signal }).catch(() => null);
  }
  throw new BackupError(
    'Synthetic PostgreSQL did not become ready',
    'INTEGRATION_POSTGRES_START_FAILED',
  );
}

export async function waitForS3(endpoint, signal) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !signal.aborted) {
    const status = await fetch(endpoint, {
      signal: globalThis.AbortSignal.timeout(2000),
    }).then(
      async (response) => {
        const result = response.status;
        await response.body?.cancel();
        return result;
      },
      () => 0,
    );
    if (status > 0 && status < 500) {
      return;
    }
    await wait(500, undefined, { signal }).catch(() => null);
  }
  throw new BackupError('Synthetic S3 storage did not become ready', 'INTEGRATION_S3_START_FAILED');
}

export function startHeartbeatServer(events) {
  const server = createServer((request, response) => {
    events.push(request.url);
    response.writeHead(200, { 'cache-control': 'no-store' });
    response.end('ok');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve({ server, port: server.address().port });
    });
  });
}

export async function createAgeRecipient(workDirectory, signal) {
  const result = await runDocker(
    [
      'run',
      '--rm',
      '--network=host',
      '--volume',
      `${workDirectory}:/integration:rw`,
      '--user',
      VOLUME_USER,
      '--entrypoint',
      '/bin/sh',
      BACKUP_IMAGE,
      '-eu',
      '-c',
      'age-keygen --output /integration/identity 2>/dev/null && age-keygen -y /integration/identity > /integration/recipient && chmod 600 /integration/identity && cat /integration/recipient',
    ],
    { signal, captureOutput: true, errorCode: 'INTEGRATION_AGE_FAILED' },
  );
  const recipient = result.trim();
  if (!recipient.startsWith('age1')) {
    throw new BackupError('Synthetic age recipient was not generated', 'INTEGRATION_AGE_FAILED');
  }
  return recipient;
}

export async function runBackupContainer(environmentPath, signal) {
  const output = await runDocker(
    ['run', '--rm', '--network=host', '--env-file', environmentPath, BACKUP_IMAGE],
    { signal, captureOutput: true, errorCode: 'INTEGRATION_BACKUP_CONTAINER_FAILED' },
  );
  const events = output
    .trim()
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  if (!events.some((event) => event.event === 'backup_verified')) {
    throw new BackupError(
      'Synthetic backup container did not verify its backup',
      'INTEGRATION_BACKUP_FAILED',
    );
  }
}

export async function runAws(
  environmentPath,
  args,
  { signal, captureOutput = false, errorCode = 'INTEGRATION_S3_COMMAND_FAILED' } = {},
) {
  return runDocker(
    [
      'run',
      '--rm',
      '--network=host',
      '--env-file',
      environmentPath,
      '--entrypoint',
      'aws',
      BACKUP_IMAGE,
      ...args,
      '--no-cli-pager',
    ],
    { signal, captureOutput, errorCode },
  );
}

export async function downloadEncryptedObject({
  workDirectory,
  environmentPath,
  bucket,
  key,
  endpoint,
  signal,
}) {
  return runDocker(
    [
      'run',
      '--rm',
      '--network=host',
      '--env-file',
      environmentPath,
      '--volume',
      `${workDirectory}:/integration:rw`,
      '--user',
      VOLUME_USER,
      '--entrypoint',
      '/bin/sh',
      BACKUP_IMAGE,
      '-eu',
      '-c',
      `aws s3api get-object --bucket '${bucket}' --key '${key}' --endpoint-url '${endpoint}' --region test-region-1 /integration/download.dump.age >/dev/null`,
    ],
    { signal, errorCode: 'INTEGRATION_DOWNLOAD_FAILED' },
  );
}

export async function runRestoreAndReadData(workDirectory, environmentPath, signal) {
  const command =
    'age --decrypt --identity /integration/identity --output /integration/restored.dump /integration/download.dump.age && ' +
    'pg_restore --no-owner --exit-on-error --dbname="$RESTORE_DATABASE_URL" /integration/restored.dump && ' +
    'psql "$RESTORE_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command "SELECT id || \':\' || payload FROM synthetic_backup_rows ORDER BY id"';
  return runDocker(
    [
      'run',
      '--rm',
      '--network=host',
      '--env-file',
      environmentPath,
      '--volume',
      `${workDirectory}:/integration:rw`,
      '--user',
      VOLUME_USER,
      '--entrypoint',
      '/bin/sh',
      BACKUP_IMAGE,
      '-eu',
      '-c',
      command,
    ],
    { signal, captureOutput: true, errorCode: 'INTEGRATION_RESTORE_FAILED' },
  );
}

export async function removeContainer(containerName) {
  await runDocker(['rm', '--force', containerName], { tolerateFailure: true });
}
