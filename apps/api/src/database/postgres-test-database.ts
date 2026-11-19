import type { Pool } from 'pg';
import type { DatabaseConnection } from './database.connection';
import type { DatabaseMigrator } from './database.migrator';

/**
 * Test-only support for PostgreSQL integration specs. These helpers recreate
 * the public schema, so they must only receive a pool for the dedicated test
 * database configured by POSTGRES_TEST_DATABASE_URL.
 */

/** The dedicated test database, or undefined when PostgreSQL specs must be skipped. */
export const postgresTestDatabaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL === ''
    ? undefined
    : process.env.POSTGRES_TEST_DATABASE_URL;

/** Declares a test that needs the dedicated PostgreSQL test database. */
export const itWithPostgres = postgresTestDatabaseUrl === undefined ? it.skip : it;

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

/**
 * Refuses destructive test setup unless the connected database name ends with
 * `_test`, so a misconfigured POSTGRES_TEST_DATABASE_URL cannot erase
 * development or production data (a name such as `paralleax_latest` is refused).
 */
export async function assertDedicatedTestDatabase(pool: Pick<Pool, 'query'>) {
  const result = await pool.query<{ name: string }>('SELECT current_database() AS name');
  const name = result.rows.at(0)?.name ?? '';
  if (!isDedicatedTestDatabaseName(name)) {
    throw new Error(`Refusing to reset "${name}": test database names must end with "_test".`);
  }
}

export function isDedicatedTestDatabaseName(name: string): boolean {
  return /_test$/i.test(name);
}

/** Replaces the public schema with an empty one, without running migrations. */
export async function clearPostgresTestSchema(pool: Pool) {
  await assertDedicatedTestDatabase(pool);
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
}

/** Waits for the test database, then rebuilds the current schema from migrations. */
export async function resetPostgresTestDatabase(pool: Pool, migrator: DatabaseMigrator) {
  await waitForPostgres(pool);
  await clearPostgresTestSchema(pool);
  await migrator.run();
}

/** Empties every migrated table while keeping the schema and its migration history. */
export async function truncatePostgresTestTables(pool: Pool) {
  await assertDedicatedTestDatabase(pool);
  const result = await pool.query<{ name: string }>(
    `SELECT quote_ident(tablename) AS name
       FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  const tables = result.rows.map(({ name }) => name);
  if (tables.length > 0) {
    await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  }
}

export interface PostgresTestUser {
  id: string;
  email: string;
  displayName?: string;
  role?: 'user' | 'admin';
}

/** Inserts the accounts that API specs authenticate as through a mocked AuthService. */
export async function insertPostgresTestUsers(pool: Pool, users: readonly PostgresTestUser[]) {
  for (const user of users) {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, display_name, created_at)
       VALUES ($1, $2, 'test-only', $3, $4, now())`,
      [user.id, user.email, user.role ?? 'user', user.displayName ?? 'User'],
    );
  }
}

/**
 * Wraps a shared test pool as the Nest DatabaseConnection. Closing a Nest
 * application leaves the pool open so one spec file can start several
 * applications; the spec ends the pool once in afterAll.
 */
export function sharedPostgresTestConnection(pool: Pool): DatabaseConnection {
  return {
    pool,
    onModuleDestroy: () => Promise.resolve(),
  };
}
