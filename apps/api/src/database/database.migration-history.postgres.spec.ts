import { Pool } from 'pg';
import { databaseMigrations } from './database.migrations';
import {
  createHistoryContext,
  verifyHistoricalState,
  type HistoryContext,
} from './migration-history.fixture';
import { historicalSteps } from './migration-history.steps';
import {
  assertForeignKeysIntact,
  createMigrator,
  hasTable,
  migrateThrough,
  runWithMigrations,
  schemaSignature,
  snapshotData,
} from './migration-history.support';
import {
  clearPostgresTestSchema,
  postgresTestDatabaseUrl,
  resetPostgresTestDatabase,
  waitForPostgres,
} from './postgres-test-database';

const describePostgres = postgresTestDatabaseUrl === undefined ? describe.skip : describe;
const pool = new Pool({ connectionString: postgresTestDatabaseUrl });

const migrationIds = databaseMigrations.map(({ id }) => id);
const sortedIds = (ids: string[]) => [...ids].sort();
const appliedIds = async () =>
  (await pool.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id')).rows.map(
    ({ id }) => id,
  );

/** Applies migrations one at a time from the first, verifying after each step. */
async function migrateChronologically(context: HistoryContext, last = migrationIds.length - 1) {
  await clearPostgresTestSchema(pool);
  for (const id of migrationIds.slice(0, last + 1)) {
    await migrateThrough(pool, id);
    await historicalSteps[id]?.(pool, context);
    await verifyHistoricalState(pool, context);
  }
}

const failing = {
  id: '999999999999_failing_migration',
  sql: `CREATE TABLE migration_failure_marker (id integer);
        UPDATE stories SET title = 'partial write';
        DELETE FROM interactions;
        SELECT 1 / 0;`,
};
const divisionByZero = { code: '22012' };
// The last migrations are applied by the failure scenarios themselves.
const lastSafe = migrationIds.indexOf('202611200046_coherent_story_access') - 1;

describePostgres('Chronological PostgreSQL migration history', () => {
  beforeAll(async () => {
    await waitForPostgres(pool);
  });

  it('keeps representative legacy data and every relation after each migration', async () => {
    await migrateChronologically(createHistoryContext());

    expect(await appliedIds()).toEqual(sortedIds(migrationIds));
    expect(await assertForeignKeysIntact(pool)).toBeGreaterThan(40);
  }, 120_000);

  it('names only registered migrations in the historical steps', () => {
    expect(Object.keys(historicalSteps).filter((id) => !migrationIds.includes(id))).toEqual([]);
  });

  it('produces the same schema as a fresh install and is idempotent on re-run', async () => {
    await migrateChronologically(createHistoryContext());
    const upgradedSchema = await schemaSignature(pool);
    const upgradedData = await snapshotData(pool);

    await createMigrator(pool).run();
    expect(await snapshotData(pool)).toEqual(upgradedData);
    expect(await schemaSignature(pool)).toEqual(upgradedSchema);

    await resetPostgresTestDatabase(pool, createMigrator(pool));
    expect(await schemaSignature(pool)).toEqual(upgradedSchema);
  }, 120_000);
});

describePostgres('Failed migrations on historical data', () => {
  beforeAll(async () => {
    await waitForPostgres(pool);
  });

  afterAll(async () => {
    await resetPostgresTestDatabase(pool, createMigrator(pool));
  }, 60_000);

  it('leaves data and schema untouched when the next migration fails, then resumes', async () => {
    const context = createHistoryContext();
    await migrateChronologically(context, lastSafe);
    const dataBefore = await snapshotData(pool);
    const schemaBefore = await schemaSignature(pool);

    await expect(
      runWithMigrations([...databaseMigrations.slice(0, lastSafe + 1), failing], () =>
        createMigrator(pool).run(),
      ),
    ).rejects.toMatchObject(divisionByZero);

    expect(await snapshotData(pool)).toEqual(dataBefore);
    expect(await schemaSignature(pool)).toEqual(schemaBefore);
    expect(await hasTable(pool, 'migration_failure_marker')).toBe(false);

    await createMigrator(pool).run();
    expect(await appliedIds()).toEqual(sortedIds(migrationIds));
    await verifyHistoricalState(pool, context);
  }, 120_000);

  it('keeps earlier committed migrations when a later one fails midway', async () => {
    const context = createHistoryContext();
    await migrateChronologically(context, lastSafe);
    const committed = databaseMigrations.slice(0, lastSafe + 3);

    await expect(
      runWithMigrations([...committed, failing, ...databaseMigrations.slice(lastSafe + 3)], () =>
        createMigrator(pool).run(),
      ),
    ).rejects.toMatchObject(divisionByZero);

    expect(await appliedIds()).toEqual(sortedIds(committed.map(({ id }) => id)));
    expect(await hasTable(pool, 'migration_failure_marker')).toBe(false);
    await verifyHistoricalState(pool, context);

    await createMigrator(pool).run();
    expect(await appliedIds()).toEqual(sortedIds(migrationIds));
    await historicalSteps[migrationIds[migrationIds.length - 1]]?.(pool, context);
    await verifyHistoricalState(pool, context);
  }, 120_000);
});

afterAll(async () => {
  await pool.end();
});
