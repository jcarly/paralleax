import type { Pool } from 'pg';
import {
  assertForeignKeysIntact,
  readRoutes,
  type VisitCondition,
} from './migration-history.support';

/**
 * Synthetic historical Stories (no production data) seeded at the schema
 * version where each entity first existed, then verified after every
 * migration. Intentional transformations are asserted explicitly in
 * `historicalSteps`; everything else must be preserved at every step.
 */

export interface HistoryContext {
  /** Rows (by text id) that must still exist in their table after every step. */
  retained: { table: string; ids: string[] }[];
  /** Reader progress is seeded once the table exists. */
  readerProgress: boolean;
}

export const createHistoryContext = (): HistoryContext => ({
  retained: [],
  readerProgress: false,
});

export type Step = (pool: Pool, context: HistoryContext) => Promise<void>;

export const created = '2026-07-01T08:00:00.000Z';
export const visited = (interactionId: string, hasBeenVisited: boolean): VisitCondition => ({
  interactionId,
  hasBeenVisited,
});

export const legacyStory = {
  title: 'Preserved legacy story',
  interactions: [
    {
      id: 'legacy-root',
      title: 'Root',
      body: 'Legacy root body',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'legacy-root-trigger', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'legacy-child',
      title: 'Child',
      body: 'Legacy child body',
      position: { x: 80, y: 252 },
      triggers: [
        {
          id: 'legacy-child-trigger',
          // Duplicate input and an invalid condition: both are dropped by the
          // normalisation, nothing else may change.
          inputInteractionIds: ['legacy-root', 'legacy-root'],
          conditions: [
            { interactionId: 'legacy-root', hasBeenVisited: true },
            { interactionId: 'legacy-root', hasBeenVisited: 'yes' },
          ],
        },
        {
          id: 'legacy-child-trigger-alt',
          inputInteractionIds: ['legacy-root'],
          conditions: [{ interactionId: 'legacy-root', hasBeenVisited: false }],
        },
      ],
    },
    {
      id: 'legacy-branch',
      title: 'Branch',
      body: 'Legacy branch body',
      triggers: [
        {
          id: 'legacy-branch-trigger',
          inputInteractionIds: ['legacy-root', 'legacy-child'],
          conditions: [{ interactionId: 'legacy-child', hasBeenVisited: true }],
        },
      ],
    },
    { id: 'legacy-loose' },
  ],
};

export const ownedStory = {
  title: 'Owned story',
  interactions: [
    {
      id: 'owned-start',
      title: 'Start',
      body: 'Hello',
      position: { x: 10, y: 20 },
      triggers: [{ id: 'owned-start-trigger', inputInteractionIds: [], conditions: [] }],
    },
  ],
};

/** Expected relational graph once every legacy Story has been normalised. */
export const expectedInteractions = [
  ['legacy-story', 'legacy-root', 'Root', 'Legacy root body', 80, 120],
  ['legacy-story', 'legacy-child', 'Child', 'Legacy child body', 80, 252],
  ['legacy-story', 'legacy-branch', 'Branch', 'Legacy branch body', 80, 384],
  ['legacy-story', 'legacy-loose', 'Untitled interaction', '', 80, 516],
  ['owned-story', 'owned-start', 'Start', 'Hello', 10, 20],
];

export const expectedRoutes: Record<string, VisitCondition[]> = {
  'legacy-story|legacy-root|': [],
  'legacy-story|legacy-child|legacy-root': [
    visited('legacy-root', true),
    visited('legacy-root', false),
  ],
  'legacy-story|legacy-branch|legacy-child,legacy-root': [visited('legacy-child', true)],
  'owned-story|owned-start|': [],
};

const expectedStories = [
  ['legacy-story', 'Preserved legacy story', 'migration-user'],
  ['legacy-untitled', 'Untitled', 'migration-user'],
  ['owned-story', 'Owned story', 'owner-real'],
];

export async function rows<T extends object>(pool: Pool, sql: string, values: unknown[] = []) {
  return (await pool.query<T>(sql, values)).rows;
}

/** Facts that must hold after every migration once the Stories are relational. */
async function verifyRelationalState(pool: Pool) {
  const stories = await rows<{
    id: string;
    title: string;
    creator_user_id: string;
    created_at: Date;
  }>(pool, 'SELECT id, title, creator_user_id, created_at FROM stories ORDER BY id');
  expect(stories.map(({ id, title, creator_user_id: owner }) => [id, title, owner])).toEqual(
    expectedStories,
  );
  expect(stories.map(({ created_at: at }) => at.toISOString()).slice(0, 2)).toEqual([
    created,
    created,
  ]);
  const interactions = await rows<Record<string, string | number>>(
    pool,
    `SELECT story_id, id, title, body, position_x::float AS x, position_y::float AS y
       FROM interactions ORDER BY story_id DESC, sort_order`,
  );
  expect(interactions.map((row) => Object.values(row))).toEqual(
    // Ordered by Story id descending, then position in the Story.
    [expectedInteractions[4], ...expectedInteractions.slice(0, 4)],
  );
  expect(await readRoutes(pool)).toEqual(expectedRoutes);
}

/** Facts that must hold after every migration while Stories are still JSON documents. */
async function verifyJsonState(pool: Pool) {
  const stories = await rows<{ id: string; ids: string[] }>(
    pool,
    `SELECT id, COALESCE(jsonb_path_query_array(data, '$.interactions[*].id'), '[]') AS ids
       FROM stories ORDER BY id`,
  );
  // The raw document may not be normalised yet (before the required-fields migration).
  expect(stories.map(({ id, ids }) => [id, ids])).toEqual([
    ['legacy-story', ['legacy-root', 'legacy-child', 'legacy-branch', 'legacy-loose']],
    ['legacy-untitled', []],
    ...(stories.some(({ id }) => id === 'owned-story') ? [['owned-story', ['owned-start']]] : []),
  ]);
}

async function verifyRetainedRows(pool: Pool, context: HistoryContext) {
  for (const { table, ids } of context.retained) {
    const found = await rows<{ id: string }>(
      pool,
      `SELECT id FROM ${table} WHERE id = ANY($1::text[]) ORDER BY id`,
      [ids],
    );
    expect({ table, ids: found.map(({ id }) => id) }).toEqual({ table, ids: [...ids].sort() });
  }
  if (context.readerProgress) {
    const state = await rows<{ ok: boolean }>(
      pool,
      `SELECT count(*)::int = 2 AS ok FROM story_reader_progress
        WHERE state->'visitedInteractionIds' @> '["owned-start"]'::jsonb
           OR state->'visitedInteractionIds' @> '["legacy-root"]'::jsonb`,
    );
    expect(state[0].ok).toBe(true);
  }
}

/** Generic integrity checks, run after every migration at the schema of that step. */
export async function verifyHistoricalState(pool: Pool, context: HistoryContext) {
  await assertForeignKeysIntact(pool);
  const json = await rows(
    pool,
    `SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stories' AND column_name = 'data'`,
  );
  if (json.length > 0) {
    await verifyJsonState(pool);
  } else {
    await verifyRelationalState(pool);
  }
  await verifyRetainedRows(pool, context);
}
