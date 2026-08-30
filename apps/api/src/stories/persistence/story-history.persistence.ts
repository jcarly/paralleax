import {
  type StoryChangeDelta,
  type StoryHistory,
  type StoryHistoryEntry,
  type StoryHistoryEventKind,
} from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';

export interface StoryHistoryEventRow {
  id: string | number;
  revision: number;
  kind: StoryHistoryEventKind;
  operation: string;
  changes: StoryChangeDelta;
  actor_user_id: string | null;
  actor_email: string | null;
  created_at: Date | string;
  reverted: boolean;
}

interface StoryHistoryAvailabilityRow {
  can_undo: boolean;
  can_redo: boolean;
}

type StoryHistoryReadRow = StoryHistoryAvailabilityRow & (StoryHistoryEventRow | { id: null });

export async function insertStoryHistoryEvent(
  client: Queryable,
  input: {
    storyId: string;
    actorUserId: string;
    revision: number;
    kind: StoryHistoryEventKind;
    operation: string;
    changes: StoryChangeDelta;
    createdAt: string;
    revertsEventId?: string;
  },
): Promise<string> {
  const result = await client.query<{ id: string | number }>(
    `INSERT INTO story_change_events
       (story_id, actor_user_id, revision, kind, operation, changes,
        reverts_event_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING id`,
    [
      input.storyId,
      input.actorUserId,
      input.revision,
      input.kind,
      input.operation,
      JSON.stringify(input.changes),
      input.revertsEventId ?? null,
      input.createdAt,
    ],
  );
  return String(result.rows[0].id);
}

export async function findStoryHistoryCandidate(
  client: Queryable,
  storyId: string,
  actorUserId: string,
  action: 'undo' | 'redo',
): Promise<StoryHistoryEventRow | undefined> {
  const kinds: StoryHistoryEventKind[] = action === 'undo' ? ['change', 'redo'] : ['undo'];
  const result = await client.query<StoryHistoryEventRow>(
    `SELECT event.id, event.revision, event.kind, event.operation, event.changes,
            event.actor_user_id, actor.email AS actor_email, event.created_at,
            false AS reverted
     FROM story_change_events AS event
     LEFT JOIN users AS actor ON actor.id = event.actor_user_id
     WHERE event.story_id = $1
       AND event.actor_user_id = $2
       AND event.kind = ANY($3::text[])
       AND NOT EXISTS (
         SELECT 1 FROM story_change_events AS inverse
         WHERE inverse.reverts_event_id = event.id
       )
     ORDER BY event.id DESC
     LIMIT 1`,
    [storyId, actorUserId, kinds],
  );
  return result.rows[0];
}

export async function readStoryHistory(
  client: Queryable,
  storyId: string,
  actorUserId: string,
  limit = 50,
): Promise<StoryHistory> {
  const result = await client.query<StoryHistoryReadRow>(
    `WITH recent_entries AS (
       SELECT event.id, event.revision, event.kind, event.operation, event.changes,
              event.actor_user_id, actor.email AS actor_email, event.created_at,
              EXISTS (
                SELECT 1 FROM story_change_events AS inverse
                WHERE inverse.reverts_event_id = event.id
              ) AS reverted
       FROM story_change_events AS event
       LEFT JOIN users AS actor ON actor.id = event.actor_user_id
       WHERE event.story_id = $1
       ORDER BY event.id DESC
       LIMIT $3
     ), availability AS (
       SELECT
         EXISTS (
           SELECT 1 FROM story_change_events AS event
           WHERE event.story_id = $1 AND event.actor_user_id = $2
             AND event.kind IN ('change', 'redo')
             AND NOT EXISTS (
               SELECT 1 FROM story_change_events AS inverse
               WHERE inverse.reverts_event_id = event.id
             )
         ) AS can_undo,
         EXISTS (
           SELECT 1 FROM story_change_events AS event
           WHERE event.story_id = $1 AND event.actor_user_id = $2
             AND event.kind = 'undo'
             AND NOT EXISTS (
               SELECT 1 FROM story_change_events AS inverse
               WHERE inverse.reverts_event_id = event.id
             )
         ) AS can_redo
     )
     SELECT recent_entries.*, availability.can_undo, availability.can_redo
     FROM availability
     LEFT JOIN recent_entries ON true
     ORDER BY recent_entries.id DESC`,
    [storyId, actorUserId, limit],
  );
  const availability = result.rows[0];
  return {
    entries: result.rows.filter(isStoryHistoryEventRow).map(storyHistoryEntry),
    canUndo: availability?.can_undo ?? false,
    canRedo: availability?.can_redo ?? false,
  };
}

function isStoryHistoryEventRow(
  row: StoryHistoryReadRow,
): row is StoryHistoryAvailabilityRow & StoryHistoryEventRow {
  return row.id !== null;
}

function storyHistoryEntry(row: StoryHistoryEventRow): StoryHistoryEntry {
  return {
    id: String(row.id),
    revision: row.revision,
    kind: row.kind,
    operation: row.operation,
    ...(row.actor_user_id
      ? {
          actor: {
            id: row.actor_user_id,
            ...(row.actor_email ? { email: row.actor_email } : {}),
          },
        }
      : {}),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    reverted: row.reverted,
  };
}
