import type { Pool } from 'pg';
import type { DatabaseMigrator } from './database.migrator';

/**
 * Test-only support for PostgreSQL integration specs. It recreates the public
 * schema, so it must only receive a pool for the dedicated test database
 * configured by POSTGRES_TEST_DATABASE_URL.
 */
export async function resetPostgresTestDatabase(pool: Pool, migrator: DatabaseMigrator) {
  await waitForPostgres(pool);
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrator.run();
}

async function waitForPostgres(pool: Pool) {
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
