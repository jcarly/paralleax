import type { Pool } from 'pg';
import type { DatabaseMigrator } from './database.migrator';

/**
 * Test-only support for PostgreSQL integration specs. These helpers recreate
 * the public schema, so they must only receive a pool for the dedicated test
 * database configured by POSTGRES_TEST_DATABASE_URL.
 */

/** Waits until the test database accepts queries. */
export async function waitForPostgres(pool: Pool) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
}

/** Replaces the public schema with an empty one, without running migrations. */
export async function clearPostgresTestSchema(pool: Pool) {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
}

/** Waits for the test database, then rebuilds the current schema from migrations. */
export async function resetPostgresTestDatabase(pool: Pool, migrator: DatabaseMigrator) {
  await waitForPostgres(pool);
  await clearPostgresTestSchema(pool);
  await migrator.run();
}
