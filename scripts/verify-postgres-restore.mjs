import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import pg from 'pg';
import { createBackup, restoreBackup } from './postgres-operations.mjs';

const sourceUrl = process.env.POSTGRES_TEST_DATABASE_URL;
if (!sourceUrl) throw new Error('POSTGRES_TEST_DATABASE_URL is required');

const restoreDatabase = `paralleax_restore_${process.pid}_${Date.now()}`;
const restoreUrl = new URL(sourceUrl);
restoreUrl.pathname = `/${restoreDatabase}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const directory = await mkdtemp(join(tmpdir(), 'paralleax-restore-check-'));
const archive = join(directory, 'backup.dump');
const admin = new pg.Client({ connectionString: adminUrl.toString() });
let adminConnected = false;

try {
  await createBackup({ databaseUrl: sourceUrl, output: archive });
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE "${restoreDatabase}"`);
  await restoreBackup({
    databaseUrl: restoreUrl.toString(),
    input: archive,
    confirmedDatabase: restoreDatabase,
  });

  const source = new pg.Client({ connectionString: sourceUrl });
  const restored = new pg.Client({ connectionString: restoreUrl.toString() });
  await source.connect();
  await restored.connect();
  try {
    const verificationQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM schema_migrations) AS migrations,
        (SELECT COUNT(*)::int FROM stories) AS stories,
        (SELECT COUNT(*)::int FROM interactions) AS interactions,
        (SELECT COUNT(*)::int FROM triggers) AS triggers,
        (SELECT COUNT(*)::int FROM users) AS users
    `;
    const sourceCounts = (await source.query(verificationQuery)).rows[0];
    const restoredCounts = (await restored.query(verificationQuery)).rows[0];
    assert.deepEqual(restoredCounts, sourceCounts);
    assert.ok(restoredCounts.migrations > 0);
  } finally {
    await source.end();
    await restored.end();
  }
  console.log(`Verified PostgreSQL backup restoration in temporary database ${restoreDatabase}`);
} finally {
  if (adminConnected) {
    await admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [restoreDatabase],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${restoreDatabase}"`);
    await admin.end();
  }
  await rm(directory, { recursive: true, force: true });
}
