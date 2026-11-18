/**
 * SQL projections of the shared story access rules owned by
 * `packages/shared/src/access-control.ts` (`resolveStoryAccess` and
 * `canDiscoverStory`). Repository queries use these predicates instead of
 * restating the rules, and `story-access.postgres.spec.ts` checks every
 * predicate against the shared functions.
 *
 * Every predicate expects these aliases in the surrounding query:
 * - `stories`: the story row;
 * - `actor`: the acting user's `users` row, or NULLs for an anonymous reader
 *   when it is joined with `LEFT JOIN`;
 * - `permission`: the acting user's `story_user_permissions` row for that
 *   story, joined with `LEFT JOIN` (only needed by readable, discoverable,
 *   editable, and commentable predicates).
 *
 * `userParameter` is the positional parameter holding the acting user id.
 */
export type SqlParameter = `$${number}`;

function privilegedSql(userParameter: SqlParameter) {
  return `actor.role = 'admin' OR stories.creator_user_id = ${userParameter}`;
}

const readableByVisibilitySql = `stories.visibility IN ('public', 'unlisted')
    OR (
      actor.id IS NOT NULL AND (
        stories.visibility = 'authenticated'
        OR stories.edit_policy = 'authenticated'
        OR (stories.visibility = 'invitation' AND permission.user_id IS NOT NULL)
      )
    )`;

/** `resolveStoryAccess(...).canManage`. Needs only `stories` and `actor`. */
export function storyManageableSql(userParameter: SqlParameter) {
  return `(${privilegedSql(userParameter)})`;
}

/** `resolveStoryAccess(...).canRead`. */
export function storyReadableSql(userParameter: SqlParameter) {
  return `(${privilegedSql(userParameter)}
    OR ${readableByVisibilitySql})`;
}

/** `canDiscoverStory`: readable, except that unlisted stories need a grant. */
export function storyDiscoverableSql(userParameter: SqlParameter) {
  return `(${privilegedSql(userParameter)}
    OR (
      stories.visibility = 'unlisted'
      AND actor.id IS NOT NULL
      AND permission.user_id IS NOT NULL
    )
    OR (stories.visibility <> 'unlisted' AND (${readableByVisibilitySql})))`;
}

/** `resolveStoryAccess(...).canEdit`. */
export function storyEditableSql(userParameter: SqlParameter) {
  return `(${privilegedSql(userParameter)}
    OR (
      actor.id IS NOT NULL AND (
        stories.edit_policy = 'authenticated'
        OR (stories.visibility <> 'private' AND permission.role = 'editor')
      )
    ))`;
}

/** `resolveStoryAccess(...).canComment`. */
export function storyCommentableSql(userParameter: SqlParameter) {
  return `(actor.id IS NOT NULL
    AND ${storyReadableSql(userParameter)}
    AND (
      stories.comment_policy = 'readers'
      OR (stories.comment_policy = 'editors' AND ${storyEditableSql(userParameter)})
    ))`;
}
