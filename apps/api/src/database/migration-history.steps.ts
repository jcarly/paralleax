import {
  created,
  legacyStory,
  ownedStory,
  rows,
  visited,
  type Step,
} from './migration-history.fixture';
import { hasTable } from './migration-history.support';

const seedJsonStories: Step = async (pool) => {
  await pool.query(
    `INSERT INTO stories (id, data, created_at, updated_at) VALUES
       ('legacy-story', $1::jsonb, $3, $3),
       ('legacy-untitled', $2::jsonb, $3, $3)`,
    [
      JSON.stringify({ id: 'legacy-story', ...legacyStory }),
      JSON.stringify({ id: 'legacy-untitled', interactions: 'not-an-array' }),
      created,
    ],
  );
};

const verifyJsonNormalisation: Step = async (pool) => {
  const stored = await rows<{
    id: string;
    data: { title: unknown; interactions: Record<string, unknown>[] };
  }>(pool, 'SELECT id, data FROM stories ORDER BY id');
  expect(stored.map(({ id, data }) => [id, data.title])).toEqual([
    ['legacy-story', 'Preserved legacy story'],
    ['legacy-untitled', 'Untitled'],
  ]);
  const { interactions } = stored[0].data;
  expect(interactions[2]).toMatchObject({ id: 'legacy-branch', position: { x: 80, y: 384 } });
  expect(interactions[3]).toMatchObject({
    id: 'legacy-loose',
    title: 'Untitled interaction',
    body: '',
    position: { x: 80, y: 516 },
  });
  expect(stored[1].data.interactions).toEqual([]);
};

const verifyPlaceholderOwner: Step = async (pool) => {
  expect(await rows(pool, 'SELECT id, creator_user_id FROM stories ORDER BY id')).toEqual([
    { id: 'legacy-story', creator_user_id: 'migration-user' },
    { id: 'legacy-untitled', creator_user_id: 'migration-user' },
  ]);
};

const seedOwnersAndOwnedStory: Step = async (pool, context) => {
  await pool.query(`INSERT INTO users (id, email, password_hash, created_at) VALUES
    ('owner-real', 'owner@example.test', 'test-only', '2026-07-02T09:00:00Z'),
    ('reader-two', 'reader@example.test', 'test-only', '2026-07-03T09:00:00Z')`);
  await pool.query(`INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES ('session-owner', 'owner-real', 'hash-owner', '2026-07-02T09:00:00Z',
            '2027-07-02T09:00:00Z')`);
  await pool.query(
    `INSERT INTO stories (id, data, created_at, updated_at, creator_user_id)
     VALUES ('owned-story', $1::jsonb, '2026-07-05T08:00:00Z', '2026-07-05T08:00:00Z', 'owner-real')`,
    [JSON.stringify({ id: 'owned-story', ...ownedStory })],
  );
  context.retained.push(
    { table: 'users', ids: ['migration-user', 'owner-real', 'reader-two'] },
    { table: 'sessions', ids: ['session-owner'] },
  );
};

const verifyGraphTables: Step = async (pool) => {
  expect(
    await rows(pool, 'SELECT trigger_id, input_interaction_id FROM trigger_inputs ORDER BY 1, 2'),
  ).toEqual([
    { trigger_id: 'legacy-branch-trigger', input_interaction_id: 'legacy-child' },
    { trigger_id: 'legacy-branch-trigger', input_interaction_id: 'legacy-root' },
    { trigger_id: 'legacy-child-trigger', input_interaction_id: 'legacy-root' },
    { trigger_id: 'legacy-child-trigger-alt', input_interaction_id: 'legacy-root' },
  ]);
  expect(await rows(pool, 'SELECT count(*)::int AS count FROM triggers')).toEqual([{ count: 5 }]);
};

const verifyPlaceholderOwnerKept: Step = async (pool) => {
  // The placeholder owner is only deleted when no Story references it.
  expect(await rows(pool, `SELECT id FROM users WHERE id = 'migration-user'`)).toHaveLength(1);
  expect(await rows(pool, 'SELECT story_id FROM triggers ORDER BY id LIMIT 1')).toEqual([
    { story_id: 'legacy-story' },
  ]);
};

const seedLocation: Step = async (pool, context) => {
  await pool.query(`INSERT INTO locations (id, story_id, name, sort_order)
    VALUES ('loc-tavern', 'legacy-story', 'Tavern', 0)`);
  await pool.query(`UPDATE interactions SET location_id = 'loc-tavern' WHERE id = 'legacy-child'`);
  context.retained.push({ table: 'locations', ids: ['loc-tavern'] });
};

const seedCharacter: Step = async (pool, context) => {
  await pool.query(`INSERT INTO characters (id, story_id, name, sort_order)
    VALUES ('char-hero', 'legacy-story', 'Hero', 0)`);
  await pool.query(`INSERT INTO interaction_characters (story_id, interaction_id, character_id, sort_order)
    VALUES ('legacy-story', 'legacy-child', 'char-hero', 0)`);
  context.retained.push({ table: 'characters', ids: ['char-hero'] });
};

const seedCharacterStat: Step = async (pool) => {
  await pool.query(`INSERT INTO character_stats (id, story_id, character_id, name, initial_value, sort_order)
    VALUES ('stat-courage', 'legacy-story', 'char-hero', 'Courage', 3, 0)`);
  await pool.query(`INSERT INTO interaction_stat_effects
      (story_id, interaction_id, stat_id, operation, value, sort_order)
    VALUES ('legacy-story', 'legacy-child', 'stat-courage', 'add', 2, 0)`);
};

const verifyStatDefinitions: Step = async (pool, context) => {
  expect(await rows(pool, 'SELECT id, name FROM stat_definitions')).toEqual([
    { id: 'stat-courage', name: 'Courage' },
  ]);
  expect(await rows(pool, 'SELECT id, stat_definition_id FROM character_stats')).toEqual([
    { id: 'stat-courage', stat_definition_id: 'stat-courage' },
  ]);
  context.retained.push({ table: 'stat_definitions', ids: ['stat-courage'] });
};

const seedReaderProgress: Step = async (pool, context) => {
  await pool.query(`INSERT INTO story_reader_progress (user_id, story_id, state, updated_at) VALUES
    ('owner-real', 'owned-story', '{"visitedInteractionIds":["owned-start"]}',
     '2026-07-10T10:00:00Z'),
    ('reader-two', 'legacy-story', '{"visitedInteractionIds":["legacy-root"]}',
     '2026-07-10T10:00:00Z')`);
  context.readerProgress = true;
};

const verifyAccessDefaults: Step = async (pool) => {
  expect(await rows(pool, 'SELECT id, role FROM users ORDER BY id')).toEqual([
    { id: 'migration-user', role: 'user' },
    { id: 'owner-real', role: 'admin' },
    { id: 'reader-two', role: 'user' },
  ]);
  expect(
    await rows(pool, 'SELECT DISTINCT visibility, edit_policy, comment_policy FROM stories'),
  ).toEqual([{ visibility: 'private', edit_policy: 'owner', comment_policy: 'disabled' }]);
};

const seedCommentThread: Step = async (pool, context) => {
  await pool.query(`INSERT INTO story_comment_threads
      (id, story_id, anchor, anchor_label, created_by, created_at, updated_at)
    VALUES ('thread-alt', 'legacy-story',
      '{"targetType":"trigger","targetId":"legacy-child-trigger-alt"}', 'Alternative route',
      'owner-real', '2026-07-11T10:00:00Z', '2026-07-11T10:00:00Z')`);
  await pool.query(`INSERT INTO story_comment_messages (id, thread_id, author_user_id, body, created_at)
    VALUES ('message-alt', 'thread-alt', 'reader-two', 'Check this route', '2026-07-11T10:00:00Z')`);
  await pool.query(`UPDATE stories SET comment_policy = 'authenticated' WHERE id = 'owned-story'`);
  context.retained.push(
    { table: 'story_comment_threads', ids: ['thread-alt'] },
    { table: 'story_comment_messages', ids: ['message-alt'] },
  );
};

const verifyCommentPolicies: Step = async (pool) => {
  expect(await rows(pool, 'SELECT id, comment_policy FROM stories ORDER BY id')).toEqual([
    { id: 'legacy-story', comment_policy: 'editors' },
    { id: 'legacy-untitled', comment_policy: 'editors' },
    { id: 'owned-story', comment_policy: 'readers' },
  ]);
};

const verifyStatAssignments: Step = async (pool) => {
  expect(
    await rows(
      pool,
      'SELECT id, owner_type, character_id, stat_definition_id, initial_value FROM stat_assignments',
    ),
  ).toEqual([
    {
      id: 'stat-courage',
      owner_type: 'character',
      character_id: 'char-hero',
      stat_definition_id: 'stat-courage',
      initial_value: 3,
    },
  ]);
  expect(
    await rows(
      pool,
      'SELECT interaction_id, stat_id, operation, value, item_id FROM interaction_stat_effects',
    ),
  ).toEqual([
    {
      interaction_id: 'legacy-child',
      stat_id: 'stat-courage',
      operation: 'add',
      value: 2,
      item_id: null,
    },
  ]);
};

const verifySaveSlots: Step = async (pool) => {
  const slots = await rows<{ slot_id: string; name: string | null; same: boolean }>(
    pool,
    'SELECT slot_id, name, created_at = updated_at AS same FROM story_reader_progress',
  );
  expect(slots).toEqual([
    { slot_id: 'reader-autosave', name: null, same: true },
    { slot_id: 'reader-autosave', name: null, same: true },
  ]);
};

const seedChangeEvent: Step = async (pool) => {
  await pool.query(`INSERT INTO story_change_events
      (story_id, actor_user_id, revision, kind, operation, changes, created_at)
    VALUES ('legacy-story', 'owner-real', 2, 'change', 'move-interaction', '{"moved":1}',
            '2026-07-12T10:00:00Z')`);
};

const verifyTriggerMerge: Step = async (pool) => {
  expect(
    await rows(
      pool,
      `SELECT id, appearance_probability, condition_groups FROM triggers
      WHERE output_interaction_id = 'legacy-child'`,
    ),
  ).toEqual([
    {
      id: 'legacy-child-trigger',
      appearance_probability: 100,
      condition_groups: [
        { id: 'legacy-child-trigger', conditions: [visited('legacy-root', true)] },
        { id: 'legacy-child-trigger-alt', conditions: [visited('legacy-root', false)] },
      ],
    },
  ]);
  expect(await rows(pool, 'SELECT count(*)::int AS count FROM triggers')).toEqual([{ count: 4 }]);
  expect(
    await rows(pool, `SELECT anchor->>'targetId' AS target FROM story_comment_threads`),
  ).toEqual([{ target: 'legacy-child-trigger' }]);
};

const verifyDisplayNames: Step = async (pool) => {
  expect(await rows(pool, 'SELECT id, display_name FROM users ORDER BY id')).toEqual([
    { id: 'migration-user', display_name: 'User MIGRATIO' },
    { id: 'owner-real', display_name: 'User OWNERREA' },
    { id: 'reader-two', display_name: 'User READERTW' },
  ]);
};

const verifyEmailsVerified: Step = async (pool) => {
  expect(
    await rows(pool, 'SELECT id FROM users WHERE email_verified_at IS DISTINCT FROM created_at'),
  ).toEqual([]);
};

const seedGroups: Step = async (pool, context) => {
  await pool.query(`INSERT INTO story_groups (id, story_id, title, sort_order) VALUES
    ('g-first', 'legacy-story', 'First', 0), ('g-second', 'legacy-story', 'Second', 1)`);
  await pool.query(`INSERT INTO story_group_interactions (story_id, group_id, interaction_id, sort_order)
    VALUES ('legacy-story', 'g-second', 'legacy-child', 5),
           ('legacy-story', 'g-first', 'legacy-child', 3),
           ('legacy-story', 'g-second', 'legacy-root', 0)`);
  context.retained.push({ table: 'story_groups', ids: ['g-first', 'g-second'] });
};

const verifyExclusiveMembership: Step = async (pool) => {
  // Intentional removal: the first Group in list order keeps the Interaction.
  expect(
    await rows(
      pool,
      'SELECT group_id, interaction_id, sort_order FROM story_group_interactions ORDER BY 2',
    ),
  ).toEqual([
    { group_id: 'g-first', interaction_id: 'legacy-child', sort_order: 3 },
    { group_id: 'g-second', interaction_id: 'legacy-root', sort_order: 0 },
  ]);
};

const seedIncoherentAccess: Step = async (pool) => {
  await pool.query(`UPDATE stories SET visibility = 'private', edit_policy = 'collaborators'
    WHERE id = 'legacy-story'`);
  await pool.query(`UPDATE stories SET visibility = 'public', edit_policy = 'authenticated'
    WHERE id = 'legacy-untitled'`);
  await pool.query(`UPDATE stories SET visibility = 'invitation', edit_policy = 'authenticated'
    WHERE id = 'owned-story'`);
};

const verifyCoherentAccess: Step = async (pool) => {
  expect(await rows(pool, 'SELECT id, visibility, edit_policy FROM stories ORDER BY id')).toEqual([
    { id: 'legacy-story', visibility: 'private', edit_policy: 'owner' },
    { id: 'legacy-untitled', visibility: 'public', edit_policy: 'authenticated' },
    { id: 'owned-story', visibility: 'invitation', edit_policy: 'collaborators' },
  ]);
};

const verifyEffectExpressions: Step = async (pool) => {
  expect(await rows(pool, 'SELECT value, expression FROM interaction_stat_effects')).toEqual([
    { value: 2, expression: null },
  ]);
};

const verifyProposals: Step = async (pool) => {
  expect(await hasTable(pool, 'story_change_proposals')).toBe(true);
  expect(
    await rows(
      pool,
      'SELECT revision, operation, changes, proposal_id, proposal_result FROM story_change_events',
    ),
  ).toEqual([
    {
      revision: 2,
      operation: 'move-interaction',
      changes: { moved: 1 },
      proposal_id: null,
      proposal_result: null,
    },
  ]);
};

/**
 * Seeding and intentional-transformation checks, keyed by the migration after
 * which they run. Seeds precede the migration that transforms them.
 */
export const historicalSteps: Partial<Record<string, Step>> = {
  '202607170001_create_stories': seedJsonStories,
  '202607180002_require_story_fields': verifyJsonNormalisation,
  '202607180003_users_and_story_ownership': verifyPlaceholderOwner,
  '202607180004_session_expiry_index': seedOwnersAndOwnedStory,
  '202607180005_normalize_story_model': verifyGraphTables,
  '202607180006_harden_story_graph': verifyPlaceholderOwnerKept,
  '202607240007_locations': seedLocation,
  '202607240008_characters': seedCharacter,
  '202607240009_character_stats': seedCharacterStat,
  '202607260010_reusable_stat_definitions': verifyStatDefinitions,
  '202607260013_reader_progress': seedReaderProgress,
  '202608130026_access_control': verifyAccessDefaults,
  '202608130027_story_comments': seedCommentThread,
  '202608160030_reader_comments': verifyCommentPolicies,
  '202608220031_typed_stats': verifyStatAssignments,
  '202608270033_reader_save_slots': verifySaveSlots,
  '202608280034_story_change_history': seedChangeEvent,
  '202608310036_trigger_condition_groups_and_probability': verifyTriggerMerge,
  '202609120038_user_display_names': verifyDisplayNames,
  '202609300040_account_security_actions': verifyEmailsVerified,
  '202610060041_flat_story_groups': seedGroups,
  '202610190043_exclusive_group_membership': verifyExclusiveMembership,
  '202610240045_unlisted_story_visibility': seedIncoherentAccess,
  '202611200046_coherent_story_access': verifyCoherentAccess,
  '202610210044_stat_effect_expressions': verifyEffectExpressions,
  '202611220049_stored_story_change_proposals': verifyProposals,
};
