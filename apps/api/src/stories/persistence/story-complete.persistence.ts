import { DEFAULT_STORY_DATE_TIME, defaultStoryAccess, type Story } from '@paralleax/shared';
import { assertStoryWithinQuotas } from '../story-quotas';
import { replaceStoryGraph } from './stories.persistence.writer';
import type { Queryable } from './stories.persistence.types';

const UPDATE_ON_CONFLICT = `
  ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      start_date_time = EXCLUDED.start_date_time,
      visibility = EXCLUDED.visibility,
      edit_policy = EXCLUDED.edit_policy,
      comment_policy = EXCLUDED.comment_policy,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`;

/** Insert a complete Story or preserve the existing save behavior when explicitly requested. */
export async function persistCompleteStory(
  client: Queryable,
  story: Story,
  ownerId: string,
  mode: 'insert' | 'upsert',
): Promise<void> {
  assertStoryWithinQuotas(story);
  await client.query(
    `INSERT INTO stories
     (id, revision, title, start_date_time, created_at, updated_at, creator_user_id,
      visibility, edit_policy, comment_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ${mode === 'upsert' ? UPDATE_ON_CONFLICT : ''}`,
    [
      story.id,
      story.revision ?? 1,
      story.title,
      story.startDateTime ?? DEFAULT_STORY_DATE_TIME,
      story.createdAt,
      story.updatedAt,
      ownerId,
      story.access?.visibility ?? defaultStoryAccess.visibility,
      story.access?.editPolicy ?? defaultStoryAccess.editPolicy,
      story.access?.commentPolicy ?? defaultStoryAccess.commentPolicy,
    ],
  );
  await replaceStoryGraph(client, story);
}
