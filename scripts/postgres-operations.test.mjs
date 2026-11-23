import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertClientCompatible,
  clientMajor,
  createBackup,
  databaseConnection,
  hasFlag,
  option,
  restoreBackup,
  serverMajor,
} from './postgres-operations.mjs';

function compatible(client, server) {
  return async (command) =>
    command === 'psql' ? `${server}0001\n` : `${command} (PostgreSQL) ${client}.1\n`;
}

test('databaseConnection keeps credentials out of command arguments', () => {
  const result = databaseConnection(
    'postgres://user:p%40ss@db.example:5433/paralleax?sslmode=require',
  );

  assert.equal(result.database, 'paralleax');
  assert.equal(result.environment.PGHOST, 'db.example');
  assert.equal(result.environment.PGPORT, '5433');
  assert.equal(result.environment.PGUSER, 'user');
  assert.equal(result.environment.PGPASSWORD, 'p@ss');
  assert.equal(result.environment.PGSSLMODE, 'require');
});

test('options require explicit values and flags are exact', () => {
  assert.equal(option(['--output=backup.dump'], 'output'), 'backup.dump');
  assert.equal(hasFlag(['--overwrite'], 'overwrite'), true);
  assert.throws(() => option([], 'output'), /Missing required option/);
});

test('backup uses a partial file, validates it, and refuses an existing target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paralleax-backup-'));
  const output = join(directory, 'backup.dump');
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, args]);
    if (command === 'pg_dump') {
      const file = args.find((argument) => argument.startsWith('--file=')).slice('--file='.length);
      await writeFile(file, 'archive');
    }
  };

  await createBackup({
    databaseUrl: 'postgres://user:secret@localhost/source',
    output,
    run,
    capture: compatible(17, 17),
  });

  assert.equal(calls[0][0], 'pg_dump');
  assert.equal(calls[1][0], 'pg_restore');
  assert.equal(
    calls.flat(2).some((value) => String(value).includes('secret')),
    false,
  );
  await assert.rejects(
    createBackup({
      databaseUrl: 'postgres://user:secret@localhost/source',
      output,
      run,
      capture: compatible(17, 17),
    }),
    /Backup already exists/,
  );
});

test('restore requires an exact database confirmation before running commands', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paralleax-restore-'));
  const input = join(directory, 'backup.dump');
  await writeFile(input, 'archive');
  const calls = [];

  await assert.rejects(
    restoreBackup({
      databaseUrl: 'postgres://user:secret@localhost/restored',
      input,
      confirmedDatabase: 'production',
      run: async (...args) => calls.push(args),
      capture: compatible(17, 17),
    }),
    /exactly match/,
  );
  assert.equal(calls.length, 0);

  await restoreBackup({
    databaseUrl: 'postgres://user:secret@localhost/restored',
    input,
    confirmedDatabase: 'restored',
    run: async (...args) => calls.push(args),
    capture: compatible(18, 18),
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].slice(0, 1), ['--list']);
  assert.equal(calls[1][1].includes('--clean'), true);
});

test('restore refuses administrative databases', async () => {
  await assert.rejects(
    restoreBackup({
      databaseUrl: 'postgres://user:secret@localhost/postgres',
      input: 'unused.dump',
      confirmedDatabase: 'postgres',
    }),
    /administrative database/,
  );
});

test('version parsers read client banners and server_version_num', () => {
  assert.equal(clientMajor('pg_dump (PostgreSQL) 18.1 (Debian 18.1-1.pgdg12+1)'), 18);
  assert.equal(clientMajor('pg_dump (PostgreSQL) 17.6'), 17);
  assert.equal(serverMajor('180001\n'), 18);
  assert.equal(serverMajor('170006'), 17);
  assert.throws(() => clientMajor('garbage'), /client version/);
  assert.throws(() => serverMajor(''), /server version/);
});

test('client compatibility accepts equal or newer clients and refuses older ones', async () => {
  const environment = {};
  assert.deepEqual(
    await assertClientCompatible({ tool: 'pg_dump', environment, capture: compatible(18, 18) }),
    { client: 18, server: 18 },
  );
  assert.deepEqual(
    await assertClientCompatible({ tool: 'pg_dump', environment, capture: compatible(18, 17) }),
    { client: 18, server: 17 },
  );
  await assert.rejects(
    assertClientCompatible({ tool: 'pg_dump', environment, capture: compatible(17, 18) }),
    /pg_dump 17 is older than the PostgreSQL 18 server; install postgresql-client-18/,
  );
});

test('backup against an older client fails before pg_dump runs and leaves no archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paralleax-backup-'));
  const output = join(directory, 'backup.dump');
  const calls = [];
  await assert.rejects(
    createBackup({
      databaseUrl: 'postgres://user:secret@localhost/source',
      output,
      run: async (...args) => calls.push(args),
      capture: compatible(17, 18),
    }),
    (error) =>
      /older than the PostgreSQL 18 server/.test(error.message) && !/secret/.test(error.message),
  );
  assert.equal(calls.length, 0);
  await assert.rejects(access(output), { code: 'ENOENT' });
});

test('restore against an older client fails before any pg_restore command', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paralleax-restore-'));
  const input = join(directory, 'backup.dump');
  await writeFile(input, 'archive');
  const calls = [];
  await assert.rejects(
    restoreBackup({
      databaseUrl: 'postgres://user:secret@localhost/restored',
      input,
      confirmedDatabase: 'restored',
      run: async (...args) => calls.push(args),
      capture: compatible(17, 18),
    }),
    /pg_restore 17 is older/,
  );
  assert.equal(calls.length, 0);
});

test('CI keeps verifying backup and restore on the production and previous majors', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /image: postgres:17-alpine/);
  assert.match(workflow, /image: postgres:18-alpine/);
  assert.match(workflow, /postgresql-client-17 postgresql-client-18/);
  assert.match(workflow, /EXPECTED_PG_MAJOR: '18'/);
  assert.match(workflow, /older than the PostgreSQL 18 server/);
});
