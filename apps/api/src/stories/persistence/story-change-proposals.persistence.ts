import type { Queryable } from './stories.persistence.types';

/** A previewed change batch (ADR-050), kept until committed or expired. */
export interface StoredStoryChangeProposal {
  id: string;
  storyId: string;
  userId: string;
  baseRevision: number;
  operations: unknown[];
  expiresAt: string;
}

/**
 * Stores a proposal, after deleting the user's expired proposals and, beyond
 * `maxPerUser`, their oldest ones: previews never accumulate.
 */
export async function insertStoryChangeProposal(
  client: Queryable,
  proposal: StoredStoryChangeProposal & { createdAt: string },
  maxPerUser: number,
): Promise<void> {
  await client.query(
    `DELETE FROM story_change_proposals
     WHERE user_id = $1
       AND (expires_at <= $2
         OR id IN (
           SELECT id FROM story_change_proposals
           WHERE user_id = $1 AND expires_at > $2
           ORDER BY created_at DESC, id DESC
           OFFSET $3
         ))`,
    [proposal.userId, proposal.createdAt, maxPerUser - 1],
  );
  await client.query(
    `INSERT INTO story_change_proposals
       (id, story_id, user_id, base_revision, operations, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      proposal.id,
      proposal.storyId,
      proposal.userId,
      proposal.baseRevision,
      JSON.stringify(proposal.operations),
      proposal.createdAt,
      proposal.expiresAt,
    ],
  );
}

/** The user's unexpired proposal for this Story, or undefined. */
export async function findStoryChangeProposal(
  client: Queryable,
  input: { id: string; storyId: string; userId: string; now: string },
): Promise<StoredStoryChangeProposal | undefined> {
  const result = await client.query<{
    id: string;
    story_id: string;
    user_id: string;
    base_revision: number;
    operations: unknown;
    expires_at: Date | string;
  }>(
    `SELECT id, story_id, user_id, base_revision, operations, expires_at
     FROM story_change_proposals
     WHERE id = $1 AND story_id = $2 AND user_id = $3 AND expires_at > $4`,
    [input.id, input.storyId, input.userId, input.now],
  );
  const row = result.rows.at(0);
  if (row === undefined || !Array.isArray(row.operations)) {
    return undefined;
  }
  return {
    id: row.id,
    storyId: row.story_id,
    userId: row.user_id,
    baseRevision: row.base_revision,
    operations: row.operations,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function deleteStoryChangeProposal(client: Queryable, id: string): Promise<void> {
  await client.query('DELETE FROM story_change_proposals WHERE id = $1', [id]);
}
