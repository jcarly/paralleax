import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { BackupError } from './postgres-backup-policy.mjs';
import {
  ageCommandEnvironment,
  databaseCommandEnvironment,
  runQuietly,
} from './postgres-backup-process.mjs';

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
    errorCode: 'DB_BACKUP_FAILED',
  });
}

export async function validatePlainArchive({ path, environment, signal, run = runQuietly }) {
  await run('pg_restore', ['--list', path], {
    environment: ageCommandEnvironment(environment),
    signal,
    operation: 'PostgreSQL archive validation',
    errorCode: 'ARCHIVE_INVALID',
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
    errorCode: 'ENCRYPTION_FAILED',
  });
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  try {
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  } catch {
    throw new BackupError('Backup integrity check failed', 'LOCAL_INTEGRITY_FAILED');
  }
}

export async function verifiedFileSize(path) {
  try {
    const details = await stat(path);
    if (!details.isFile() || details.size === 0) {
      throw new BackupError('Backup integrity check failed', 'LOCAL_INTEGRITY_FAILED');
    }
    return details.size;
  } catch (error) {
    if (error instanceof BackupError) {
      throw error;
    }
    throw new BackupError('Backup integrity check failed', 'LOCAL_INTEGRITY_FAILED');
  }
}

export async function createEncryptedArchive({
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
