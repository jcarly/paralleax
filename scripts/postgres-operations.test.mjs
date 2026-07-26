import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createBackup,
  databaseConnection,
  hasFlag,
  option,
  restoreBackup,
} from './postgres-operations.mjs';

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
    }),
    /exactly match/,
  );
  assert.equal(calls.length, 0);

  await restoreBackup({
    databaseUrl: 'postgres://user:secret@localhost/restored',
    input,
    confirmedDatabase: 'restored',
    run: async (...args) => calls.push(args),
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
