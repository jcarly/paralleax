import { execFile, spawn } from 'node:child_process';
import { access, chmod, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
  if (sslMode) {
    environment.PGSSLMODE = sslMode;
  }

  return { database, environment };
}

export function option(args, name) {
  const prefix = `--${name}=`;
  const value = args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) {
    throw new Error(`Missing required option ${prefix}<value>`);
  }
  return value;
}

export function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

export function clientMajor(versionOutput) {
  const match = /\(PostgreSQL\)\s+(\d+)/.exec(versionOutput);
  if (!match) {
    throw new Error('Unable to read the PostgreSQL client version');
  }
  return Number(match[1]);
}

export function serverMajor(serverVersionNum) {
  const number = Number(String(serverVersionNum).trim());
  if (!Number.isInteger(number) || number < 100000) {
    throw new Error('Unable to read the PostgreSQL server version');
  }
  return Math.floor(number / 10000);
}

/**
 * Refuses a client tool older than the target server. pg_dump cannot dump a
 * newer server, and pg_restore of a newer-format archive is likewise unsafe.
 * A newer client against an older server is supported by PostgreSQL.
 * Messages carry versions only, never connection details.
 */
export async function assertClientCompatible({ tool, environment, capture = captureCommand }) {
  const client = clientMajor(await capture(tool, ['--version'], environment));
  const server = serverMajor(
    await capture('psql', ['-X', '-A', '-t', '-c', 'SHOW server_version_num'], environment),
  );
  if (client < server) {
    throw new Error(
      `${tool} ${client} is older than the PostgreSQL ${server} server; install postgresql-client-${server} or newer`,
    );
  }
  return { client, server };
}

export async function createBackup({
  databaseUrl,
  output,
  overwrite = false,
  run = runCommand,
  capture = captureCommand,
}) {
  const target = resolve(output);
  const temporaryTarget = `${target}.partial-${process.pid}`;
  if (!overwrite) {
    try {
      await access(target);
      throw new Error(`Backup already exists: ${target}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  const { environment } = databaseConnection(databaseUrl);
  await mkdir(dirname(target), { recursive: true });
  await rm(temporaryTarget, { force: true });

  try {
    await assertClientCompatible({ tool: 'pg_dump', environment, capture });
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

export async function restoreBackup({
  databaseUrl,
  input,
  confirmedDatabase,
  run = runCommand,
  capture = captureCommand,
}) {
  const source = resolve(input);
  const { database, environment } = databaseConnection(databaseUrl);
  if (['postgres', 'template0', 'template1'].includes(database)) {
    throw new Error(`Refusing to restore into administrative database "${database}"`);
  }
  if (confirmedDatabase !== database) {
    throw new Error(`Restore confirmation must exactly match database "${database}"`);
  }

  await access(source);
  await assertClientCompatible({ tool: 'pg_restore', environment, capture });
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

export async function captureCommand(command, args, environment) {
  try {
    const { stdout } = await execFileAsync(command, args, { env: environment, windowsHide: true });
    return stdout;
  } catch (error) {
    // Never forward the child's stderr or arguments: they may echo connection details.
    throw new Error(`${command} could not be run to check version compatibility (${error.code})`);
  }
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
