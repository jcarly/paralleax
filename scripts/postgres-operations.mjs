import { spawn } from 'node:child_process';
import { access, chmod, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';

const SAFE_DATABASE_NAME = /^[A-Za-z0-9_.-]+$/;

export function databaseConnection(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Database URL must use postgres: or postgresql:');
  }

  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || !SAFE_DATABASE_NAME.test(database)) {
    throw new Error('Database URL must contain a safe database name');
  }

  const environment = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: database,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  };
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) environment.PGSSLMODE = sslMode;

  return { database, environment };
}

export function option(args, name) {
  const prefix = `--${name}=`;
  const value = args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`Missing required option ${prefix}<value>`);
  return value;
}

export function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

export async function createBackup({ databaseUrl, output, overwrite = false, run = runCommand }) {
  const target = resolve(output);
  const temporaryTarget = `${target}.partial-${process.pid}`;
  if (!overwrite) {
    try {
      await access(target);
      throw new Error(`Backup already exists: ${target}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const { environment } = databaseConnection(databaseUrl);
  await mkdir(dirname(target), { recursive: true });
  await rm(temporaryTarget, { force: true });

  try {
    await run(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-privileges', `--file=${temporaryTarget}`],
      environment,
    );
    await run('pg_restore', ['--list', temporaryTarget], environment);
    await chmod(temporaryTarget, 0o600);
    await rename(temporaryTarget, target);
  } catch (error) {
    await rm(temporaryTarget, { force: true });
    throw error;
  }

  return target;
}

export async function restoreBackup({ databaseUrl, input, confirmedDatabase, run = runCommand }) {
  const source = resolve(input);
  const { database, environment } = databaseConnection(databaseUrl);
  if (['postgres', 'template0', 'template1'].includes(database)) {
    throw new Error(`Refusing to restore into administrative database "${database}"`);
  }
  if (confirmedDatabase !== database) {
    throw new Error(`Restore confirmation must exactly match database "${database}"`);
  }

  await access(source);
  await run('pg_restore', ['--list', source], environment);
  await run(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      `--dbname=${database}`,
      source,
    ],
    environment,
  );
}

export function runCommand(command, args, environment) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(`${command} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`),
      );
    });
  });
}
