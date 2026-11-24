import type { Pool } from 'pg';
import { databaseMigrations, type DatabaseMigration } from './database.migrations';
import { DatabaseMigrator } from './database.migrator';
import { sharedPostgresTestConnection } from './postgres-test-database';

/**
 * Test-only helpers for the chronological migration history spec. They never
 * implement a second migration engine: every step runs through the real
 * DatabaseMigrator, restricted to a prefix of the registered migrations.
 */

export function createMigrator(pool: Pool): DatabaseMigrator {
  return new DatabaseMigrator(sharedPostgresTestConnection(pool));
}

/** Runs `action` with the migrator seeing only `migrations`, then restores the registry. */
export async function runWithMigrations<T>(
  migrations: readonly DatabaseMigration[],
  action: () => Promise<T>,
): Promise<T> {
  const original = [...databaseMigrations];
  databaseMigrations.splice(0, databaseMigrations.length, ...migrations);
  try {
    return await action();
  } finally {
    databaseMigrations.splice(0, databaseMigrations.length, ...original);
  }
}

/** Applies every pending migration up to and including `migrationId`, in order. */
export async function migrateThrough(pool: Pool, migrationId: string): Promise<void> {
  const index = databaseMigrations.findIndex(({ id }) => id === migrationId);
  if (index < 0) {
    throw new Error(`Unknown migration ${migrationId}.`);
  }
  await runWithMigrations(databaseMigrations.slice(0, index + 1), () => createMigrator(pool).run());
}

export async function hasTable(pool: Pool, table: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return result.rowCount === 1;
}

export async function hasColumn(pool: Pool, table: string, column: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return result.rowCount === 1;
}

interface ForeignKeyRow {
  name: string;
  child: string;
  parent: string;
  validated: boolean;
  child_columns: string[];
  parent_columns: string[];
}

const foreignKeySql = `
  SELECT c.conname AS name, c.conrelid::regclass::text AS child,
         c.confrelid::regclass::text AS parent, c.convalidated AS validated,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         ) AS child_columns,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum
         ) AS parent_columns
    FROM pg_constraint c
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
   ORDER BY c.conname`;

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

function orphanCountSql(key: ForeignKeyRow): string {
  const present = key.child_columns.map((column) => `child.${quote(column)} IS NOT NULL`);
  const matches = key.child_columns.map(
    (column, index) => `parent.${quote(key.parent_columns[index])} = child.${quote(column)}`,
  );
  // MATCH SIMPLE: a row is only constrained when every referencing column is set.
  return `SELECT count(*)::int AS orphans FROM ${key.child} AS child
    WHERE ${present.join(' AND ')}
      AND NOT EXISTS (SELECT 1 FROM ${key.parent} AS parent WHERE ${matches.join(' AND ')})`;
}

/**
 * Every foreign key present at this step is validated and has no orphan row.
 * The keys are read from the catalog, so the check follows the schema of the
 * step instead of assuming the final one. Returns how many keys were checked.
 */
export async function assertForeignKeysIntact(pool: Pool): Promise<number> {
  const keys = (await pool.query<ForeignKeyRow>(foreignKeySql)).rows;
  for (const key of keys) {
    const orphans = (await pool.query<{ orphans: number }>(orphanCountSql(key))).rows[0].orphans;
    expect({ constraint: key.name, validated: key.validated, orphans }).toEqual({
      constraint: key.name,
      validated: true,
      orphans: 0,
    });
  }
  return keys.length;
}

export interface VisitCondition {
  interactionId: string;
  hasBeenVisited: boolean;
}

async function triggerConditionsSql(pool: Pool): Promise<string> {
  if (await hasTable(pool, 'trigger_conditions')) {
    return `COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'interactionId', c.interaction_id, 'hasBeenVisited', c.has_been_visited
      ) ORDER BY c.sort_order) FROM trigger_conditions c WHERE c.trigger_id = t.id), '[]'::jsonb)`;
  }
  if (await hasColumn(pool, 'triggers', 'conditions')) {
    return 't.conditions';
  }
  return `COALESCE((SELECT jsonb_agg(condition.value ORDER BY grp.ordinality, condition.ordinality)
      FROM jsonb_array_elements(t.condition_groups) WITH ORDINALITY AS grp(value, ordinality)
      CROSS JOIN LATERAL jsonb_array_elements(grp.value->'conditions')
        WITH ORDINALITY AS condition(value, ordinality)), '[]'::jsonb)`;
}

/**
 * Reachability routes keyed by `story|output|sorted inputs`, each with its
 * flattened ordered conditions. Keying by route makes the result identical
 * before and after the trigger merge, while the three condition storage
 * layouts (rows, JSON array, condition groups) are read as the step provides.
 */
export async function readRoutes(pool: Pool): Promise<Record<string, VisitCondition[]>> {
  const conditions = await triggerConditionsSql(pool);
  const rows = (
    await pool.query<{
      story_id: string;
      output: string;
      inputs: string[];
      conditions: VisitCondition[];
    }>(
      `SELECT i.story_id, t.output_interaction_id AS output,
              COALESCE((SELECT array_agg(ti.input_interaction_id)
                          FROM trigger_inputs ti WHERE ti.trigger_id = t.id), '{}') AS inputs,
              ${conditions} AS conditions
         FROM triggers t JOIN interactions i ON i.id = t.output_interaction_id
        ORDER BY t.sort_order, t.id`,
    )
  ).rows;
  const routes: Record<string, VisitCondition[]> = {};
  for (const row of rows) {
    const key = `${row.story_id}|${row.output}|${[...row.inputs].sort().join(',')}`;
    routes[key] = [...(routes[key] ?? []), ...row.conditions];
  }
  return routes;
}

/** Full content of every table, for before/after comparisons. */
export async function snapshotData(pool: Pool): Promise<Record<string, unknown>> {
  const tables = await pool.query<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const snapshot: Record<string, unknown> = {};
  for (const { name } of tables.rows) {
    const rows = await pool.query<{ rows: unknown }>(
      `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows
         FROM ${quote(name)} AS t`,
    );
    snapshot[name] = rows.rows[0].rows;
  }
  return snapshot;
}

/** Columns, constraints, indexes and triggers, to compare two schemas. */
export async function schemaSignature(pool: Pool): Promise<Record<string, unknown[]>> {
  const run = async (sql: string) => (await pool.query(sql)).rows as unknown[];
  return {
    columns: await run(`SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, column_name`),
    constraints: await run(`SELECT conrelid::regclass::text AS table_name, conname,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`),
    indexes: await run(`SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' ORDER BY tablename, indexname`),
    triggers: await run(`SELECT tgrelid::regclass::text AS table_name, tgname
      FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`),
  };
}
