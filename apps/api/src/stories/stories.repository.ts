import { Injectable } from '@nestjs/common';
import {
  applyStoryChangeDelta,
  createStoryChangeDelta,
  createStoryHistoryMutationResult,
  DEFAULT_STORY_DATE_TIME,
  READER_AUTOSAVE_ID,
  defaultStoryAccess,
  invertStoryChangeDelta,
  readerSaveKind,
  resolveStoryAccess,
  storyHistoryOperations,
  type GraphDecoration,
  type ConditionalTextBlock,
  type ItemRelationshipType,
  type ReaderProgressState,
  type ReaderSave,
  type Story,
  type StoryHistory,
  type StoryHistoryMutationResult,
  type StoryAccessConfiguration,
  type StoryAccessSettings,
  type StoryCollaboratorRole,
  type StorySummary,
  type StatValue,
  type StatValueType,
  type TriggerConditionGroup,
} from '@paralleax/shared';
import type { PoolClient } from 'pg';
import { DatabaseConnection } from '../database/database.connection';
import type { Queryable } from './persistence/stories.persistence.types';
import {
  persistStoryDifference,
  replaceStoryGraph,
} from './persistence/stories.persistence.writer';
import {
  findStoryHistoryCandidate,
  insertStoryHistoryEvent,
  readStoryHistory,
} from './persistence/story-history.persistence';

type StoryRow = {
  id: string;
  revision: number;
  title: string;
  creator_user_id: string;
  owner_email: string;
  visibility: StoryAccessSettings['visibility'];
  edit_policy: StoryAccessSettings['editPolicy'];
  comment_policy: StoryAccessSettings['commentPolicy'];
  actor_id: string | null;
  actor_role: 'user' | 'admin' | null;
  collaborator_role: StoryCollaboratorRole | null;
  start_date_time: string;
  created_at: Date | string;
  updated_at: Date | string;
};
type StorySummaryRow = StoryRow & {
  interaction_count: number | string;
};
type PublicStorySummaryRow = Omit<StorySummaryRow, 'owner_email'>;
type InteractionRow = {
  id: string;
  story_id: string;
  title: string;
  body: string;
  position_x: number;
  position_y: number;
  location_id: string | null;
  duration_minutes: number;
  conditional_text_blocks: ConditionalTextBlock[];
  sort_order: number;
};
type GraphDecorationRow = {
  id: string;
  story_id: string;
  kind: GraphDecoration['kind'];
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  text_content: string | null;
  color: string;
  font_size: number | null;
  font_family: 'sans' | 'serif' | 'monospace' | 'display' | null;
  font_weight: 'normal' | 'bold' | null;
  font_style: 'normal' | 'italic' | null;
  sort_order: number;
};
type LocationRow = {
  id: string;
  story_id: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  sort_order: number;
};
type CharacterRow = LocationRow & {
  is_playable: boolean;
};
type StatDefinitionRow = {
  id: string;
  story_id: string;
  name: string;
  value_type: StatValueType;
  category: string;
  image_url: string;
  change_per_hour: number;
  sort_order: number;
};
type StatAssignmentRow = {
  id: string;
  story_id: string;
  stat_definition_id: string;
  owner_type: 'story' | 'character' | 'location' | 'item_definition';
  character_id: string | null;
  location_id: string | null;
  item_definition_id: string | null;
  initial_value: StatValue;
  sort_order: number;
};
type ItemDefinitionRow = LocationRow;
type InteractionCharacterRow = {
  story_id: string;
  interaction_id: string;
  character_id: string;
  sort_order: number;
};
type CharacterItemRow = {
  id: string;
  story_id: string;
  character_id: string | null;
  location_id: string | null;
  item_definition_id: string;
  sort_order: number;
};
type ItemRelationshipRow = {
  story_id: string;
  parent_item_id: string;
  child_item_id: string;
  relationship_type: ItemRelationshipType;
  slot_key: string | null;
  sort_order: number;
};
type StatEffectRow = {
  story_id: string;
  interaction_id: string;
  stat_id: string;
  item_id: string | null;
  operation: 'add' | 'set';
  value: StatValue;
  sort_order: number;
};
type ItemEffectRow = {
  story_id: string;
  interaction_id: string;
  item_id: string | null;
  item_definition_id: string | null;
  character_id: string | null;
  operation: 'obtain' | 'lose';
  sort_order: number;
};
type TriggerRow = {
  id: string;
  story_id: string;
  output_interaction_id: string;
  position_x: number | null;
  position_y: number | null;
  sort_order: number;
  condition_groups: TriggerConditionGroup[];
  appearance_probability: number;
  timer_seconds: number | null;
};
type TriggerInputRow = {
  story_id: string;
  trigger_id: string;
  input_interaction_id: string;
  sort_order: number;
};
type ReaderProgressRow = {
  slot_id: string;
  name: string | null;
  state: ReaderProgressState;
  created_at: Date | string;
  updated_at: Date | string;
};

const storyAccessSelect = `SELECT stories.id, stories.revision, stories.title,
  stories.creator_user_id, owner.email AS owner_email,
  stories.visibility, stories.edit_policy, stories.comment_policy,
  actor.id AS actor_id, actor.role AS actor_role, permission.role AS collaborator_role,
  stories.start_date_time, stories.created_at, stories.updated_at
  FROM stories
  JOIN users AS owner ON owner.id = stories.creator_user_id
  LEFT JOIN users AS actor ON actor.id = $2
  LEFT JOIN story_user_permissions AS permission
    ON permission.story_id = stories.id AND permission.user_id = actor.id`;

@Injectable()
export class StoriesRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async list(userId: string): Promise<StorySummary[]> {
    const result = await this.database.pool.query<StorySummaryRow>(
      `SELECT stories.id, stories.revision, stories.title, stories.creator_user_id,
              owner.email AS owner_email, stories.visibility, stories.edit_policy,
              stories.comment_policy, actor.id AS actor_id, actor.role AS actor_role,
              permission.role AS collaborator_role, stories.start_date_time,
              stories.created_at, stories.updated_at, COUNT(interactions.id) AS interaction_count
       FROM stories
       JOIN users AS owner ON owner.id = stories.creator_user_id
       JOIN users AS actor ON actor.id = $1
       LEFT JOIN story_user_permissions AS permission
         ON permission.story_id = stories.id AND permission.user_id = $1
       LEFT JOIN interactions ON interactions.story_id = stories.id
       WHERE actor.role = 'admin'
          OR stories.creator_user_id = $1
          OR stories.visibility IN ('public', 'authenticated')
          OR stories.edit_policy = 'authenticated'
          OR (stories.visibility = 'invitation' AND permission.user_id IS NOT NULL)
       GROUP BY stories.id, owner.id, actor.id, permission.role
       ORDER BY stories.updated_at DESC, stories.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      title: row.title,
      interactionCount: Number(row.interaction_count),
      startDateTime: row.start_date_time,
      access: accessSettings(row),
      capabilities: capabilities(row, userId),
      owner: { id: row.creator_user_id, email: row.owner_email },
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  async listPublic(): Promise<StorySummary[]> {
    const result = await this.database.pool.query<PublicStorySummaryRow>(
      `SELECT stories.id, stories.revision, stories.title, stories.creator_user_id,
              stories.visibility, stories.edit_policy, stories.comment_policy,
              NULL::text AS actor_id, NULL::text AS actor_role,
              NULL::text AS collaborator_role, stories.start_date_time,
              stories.created_at, stories.updated_at, COUNT(interactions.id) AS interaction_count
       FROM stories
       LEFT JOIN interactions ON interactions.story_id = stories.id
       WHERE stories.visibility = 'public'
       GROUP BY stories.id
       ORDER BY stories.updated_at DESC, stories.created_at DESC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      revision: row.revision,
      title: row.title,
      interactionCount: Number(row.interaction_count),
      startDateTime: row.start_date_time,
      access: accessSettings(row),
      capabilities: capabilities(row),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }

  async find(id: string, userId?: string): Promise<Story | undefined> {
    return this.findWith(this.database.pool, id, userId);
  }

  async save(story: Story, ownerId: string): Promise<void> {
    await this.transaction(async (client) => {
      await this.saveWith(client, story, ownerId);
    });
  }

  async saveMany(stories: readonly Story[], ownerId: string): Promise<void> {
    await this.transaction(async (client) => {
      for (const story of stories) await this.saveWith(client, story, ownerId);
    });
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
    ownerId: string,
    operation: string = storyHistoryOperations.storyUpdated,
  ): Promise<Story | undefined> {
    return this.transaction(async (client) => {
      if (!(await this.hasEditAccess(client, id, ownerId, true))) return undefined;
      const current = await this.findWith(client, id, ownerId);
      if (!current) return undefined;
      const updated = await mutation(structuredClone(current));
      const changes = createStoryChangeDelta(current, updated);
      await persistStoryDifference(client, current, updated, changes);
      if (changes && updated.revision !== current.revision && updated.revision !== undefined) {
        await insertStoryHistoryEvent(client, {
          storyId: id,
          actorUserId: ownerId,
          revision: updated.revision,
          kind: 'change',
          operation,
          changes,
          createdAt: updated.updatedAt,
        });
      }
      return this.findWith(client, id, ownerId);
    });
  }

  async getHistory(id: string, userId: string, limit = 50): Promise<StoryHistory | undefined> {
    if (!(await this.hasEditAccess(this.database.pool, id, userId))) return undefined;
    return readStoryHistory(this.database.pool, id, userId, limit);
  }

  async revertHistory(
    id: string,
    userId: string,
    action: 'undo' | 'redo',
  ): Promise<
    | { kind: 'applied'; result: StoryHistoryMutationResult }
    | { kind: 'unavailable' }
    | { kind: 'conflict'; paths: string[] }
    | undefined
  > {
    try {
      return await this.transaction(async (client) => {
        if (!(await this.hasEditAccess(client, id, userId, true))) return undefined;
        const event = await findStoryHistoryCandidate(client, id, userId, action);
        if (!event) return { kind: 'unavailable' as const };
        const current = await this.findWith(client, id, userId);
        if (!current) return undefined;
        const reverted = applyStoryChangeDelta(current, event.changes, 'backward');
        if (!reverted.applied) {
          throw new StoryHistoryConflictError(reverted.conflicts.map(({ path }) => path));
        }

        const updated = reverted.story;
        updated.id = id;
        updated.updatedAt = new Date().toISOString();
        updated.revision = (current.revision ?? 1) + 1;
        const changes = invertStoryChangeDelta(event.changes);

        await persistStoryDifference(client, current, updated, changes);
        await insertStoryHistoryEvent(client, {
          storyId: id,
          actorUserId: userId,
          revision: updated.revision,
          kind: action,
          operation: event.operation,
          changes,
          createdAt: updated.updatedAt,
          revertsEventId: String(event.id),
        });
        const history = await readStoryHistory(client, id, userId);
        return {
          kind: 'applied' as const,
          result: createStoryHistoryMutationResult(current, updated, changes, history),
        };
      });
    } catch (error) {
      if (error instanceof StoryHistoryConflictError) {
        return { kind: 'conflict', paths: error.paths };
      }
      if (isPostgresHistoryConflict(error)) return { kind: 'conflict', paths: [] };
      throw error;
    }
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await this.database.pool.query(
      `DELETE FROM stories
       USING users AS actor
       WHERE stories.id = $1 AND actor.id = $2
         AND (stories.creator_user_id = $2 OR actor.role = 'admin')`,
      [id, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findProgress(
    storyId: string,
    userId: string,
    slotId = READER_AUTOSAVE_ID,
  ): Promise<ReaderSave | undefined> {
    const result = await this.database.pool.query<ReaderProgressRow>(
      `SELECT progress.slot_id, progress.name, progress.state,
              progress.created_at, progress.updated_at
       FROM story_reader_progress AS progress
       JOIN stories ON stories.id = progress.story_id
       JOIN users AS actor ON actor.id = $2
       LEFT JOIN story_user_permissions AS permission
         ON permission.story_id = stories.id AND permission.user_id = $2
       WHERE progress.story_id = $1
         AND progress.user_id = $2
         AND progress.slot_id = $3
         AND (
           actor.role = 'admin' OR stories.creator_user_id = $2
           OR stories.visibility IN ('public', 'authenticated')
           OR stories.edit_policy = 'authenticated'
           OR (stories.visibility = 'invitation' AND permission.user_id IS NOT NULL)
         )`,
      [storyId, userId, slotId],
    );
    const row = result.rows[0];
    return row ? readerSave(row) : undefined;
  }

  async findProgressSaves(storyId: string, userId: string): Promise<ReaderSave[]> {
    const result = await this.database.pool.query<ReaderProgressRow>(
      `SELECT progress.slot_id, progress.name, progress.state,
              progress.created_at, progress.updated_at
       FROM story_reader_progress AS progress
       JOIN stories ON stories.id = progress.story_id
       JOIN users AS actor ON actor.id = $2
       LEFT JOIN story_user_permissions AS permission
         ON permission.story_id = stories.id AND permission.user_id = $2
       WHERE progress.story_id = $1
         AND progress.user_id = $2
         AND (
           actor.role = 'admin' OR stories.creator_user_id = $2
           OR stories.visibility IN ('public', 'authenticated')
           OR stories.edit_policy = 'authenticated'
           OR (stories.visibility = 'invitation' AND permission.user_id IS NOT NULL)
         )
       ORDER BY progress.updated_at DESC, progress.slot_id`,
      [storyId, userId],
    );
    return result.rows.map(readerSave);
  }

  async saveProgress(
    storyId: string,
    userId: string,
    state: ReaderProgressState,
    updatedAt: string,
    slotId = READER_AUTOSAVE_ID,
    name?: string,
    createdAt = updatedAt,
  ): Promise<boolean> {
    const result = await this.database.pool.query(
      `INSERT INTO story_reader_progress
         (user_id, story_id, slot_id, name, state, created_at, updated_at)
       SELECT $2, $1, $5, $6, $3::jsonb, $7, $4
       FROM stories
       JOIN users AS actor ON actor.id = $2
       LEFT JOIN story_user_permissions AS permission
         ON permission.story_id = stories.id AND permission.user_id = $2
       WHERE stories.id = $1
         AND (
           actor.role = 'admin' OR stories.creator_user_id = $2
           OR stories.visibility IN ('public', 'authenticated')
           OR stories.edit_policy = 'authenticated'
           OR (stories.visibility = 'invitation' AND permission.user_id IS NOT NULL)
         )
       ON CONFLICT (user_id, story_id, slot_id) DO UPDATE
       SET name = EXCLUDED.name, state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
      [storyId, userId, JSON.stringify(state), updatedAt, slotId, name ?? null, createdAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteProgress(
    storyId: string,
    userId: string,
    slotId = READER_AUTOSAVE_ID,
  ): Promise<void> {
    await this.database.pool.query(
      'DELETE FROM story_reader_progress WHERE story_id = $1 AND user_id = $2 AND slot_id = $3',
      [storyId, userId, slotId],
    );
  }

  async getAccess(id: string, userId: string): Promise<StoryAccessConfiguration | undefined> {
    const story = await this.database.pool.query<StoryRow>(
      `${storyAccessSelect}
       WHERE stories.id = $1
         AND (stories.creator_user_id = $2 OR actor.role = 'admin')`,
      [id, userId],
    );
    const row = story.rows[0];
    if (!row) return undefined;
    const collaborators = await this.database.pool.query<{
      user_id: string;
      email: string;
      role: StoryCollaboratorRole;
    }>(
      `SELECT permission.user_id, users.email, permission.role
       FROM story_user_permissions AS permission
       JOIN users ON users.id = permission.user_id
       WHERE permission.story_id = $1
       ORDER BY users.email`,
      [id],
    );
    return {
      ...accessSettings(row),
      owner: { id: row.creator_user_id, email: row.owner_email },
      collaborators: collaborators.rows.map((item) => ({
        userId: item.user_id,
        email: item.email,
        role: item.role,
      })),
    };
  }

  async updateAccess(id: string, userId: string, settings: StoryAccessSettings): Promise<boolean> {
    const result = await this.database.pool.query(
      `UPDATE stories
       SET visibility = $3, edit_policy = $4, comment_policy = $5, updated_at = now()
       FROM users AS actor
       WHERE stories.id = $1 AND actor.id = $2
         AND (stories.creator_user_id = $2 OR actor.role = 'admin')`,
      [id, userId, settings.visibility, settings.editPolicy, settings.commentPolicy],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setCollaborator(
    id: string,
    userId: string,
    email: string,
    role: StoryCollaboratorRole,
  ): Promise<boolean> {
    const result = await this.database.pool.query(
      `INSERT INTO story_user_permissions (story_id, user_id, role, updated_at)
       SELECT stories.id, invited.id, $4, now()
       FROM stories
       JOIN users AS actor ON actor.id = $2
       JOIN users AS invited ON invited.email = $3
       WHERE stories.id = $1
         AND invited.id <> stories.creator_user_id
         AND (stories.creator_user_id = $2 OR actor.role = 'admin')
       ON CONFLICT (story_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, updated_at = now()`,
      [id, userId, email, role],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async removeCollaborator(id: string, userId: string, collaboratorId: string): Promise<boolean> {
    const result = await this.database.pool.query(
      `DELETE FROM story_user_permissions AS permission
       USING stories, users AS actor
       WHERE permission.story_id = $1 AND permission.user_id = $3
         AND stories.id = permission.story_id AND actor.id = $2
         AND (stories.creator_user_id = $2 OR actor.role = 'admin')`,
      [id, userId, collaboratorId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async findWith(queryable: Queryable, id: string, userId?: string) {
    const result = await queryable.query<StoryRow>(
      `${storyAccessSelect}
       WHERE stories.id = $1
         AND (
           actor.role = 'admin' OR stories.creator_user_id = $2
           OR stories.visibility = 'public'
           OR (
             actor.id IS NOT NULL AND (
               stories.visibility = 'authenticated'
               OR stories.edit_policy = 'authenticated'
               OR (stories.visibility = 'invitation' AND permission.user_id IS NOT NULL)
             )
           )
         )`,
      [id, userId ?? null],
    );
    return (await this.assemble(queryable, result.rows))[0];
  }

  private async assemble(queryable: Queryable, storyRows: StoryRow[]): Promise<Story[]> {
    if (storyRows.length === 0) return [];
    const storyIds = storyRows.map(({ id }) => id);
    const interactions = await queryable.query<InteractionRow>(
      `SELECT id, story_id, title, body, position_x, position_y, location_id,
              duration_minutes, conditional_text_blocks, sort_order
         FROM interactions WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const graphDecorations = await queryable.query<GraphDecorationRow>(
      `SELECT id, story_id, kind, position_x, position_y, width, height,
              text_content, color, font_size, font_family, font_weight, font_style, sort_order
         FROM graph_decorations WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const locations = await queryable.query<LocationRow>(
      `SELECT id, story_id, name, description, category, image_url, sort_order
         FROM locations WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const characters = await queryable.query<CharacterRow>(
      `SELECT id, story_id, name, description, category, image_url, is_playable, sort_order
         FROM characters WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const statDefinitions = await queryable.query<StatDefinitionRow>(
      `SELECT id, story_id, name, value_type, category, image_url,
              change_per_hour, sort_order
         FROM stat_definitions WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const statAssignments = await queryable.query<StatAssignmentRow>(
      `SELECT id, story_id, stat_definition_id, owner_type, character_id,
              location_id, item_definition_id, initial_value, sort_order
         FROM stat_assignments WHERE story_id = ANY($1::text[])
         ORDER BY story_id, owner_type, sort_order`,
      [storyIds],
    );
    const itemDefinitions = await queryable.query<ItemDefinitionRow>(
      `SELECT id, story_id, name, description, category, image_url, sort_order
         FROM item_definitions WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const interactionCharacters = await queryable.query<InteractionCharacterRow>(
      `SELECT story_id, interaction_id, character_id, sort_order
         FROM interaction_characters WHERE story_id = ANY($1::text[])
         ORDER BY story_id, interaction_id, sort_order`,
      [storyIds],
    );
    const characterItems = await queryable.query<CharacterItemRow>(
      `SELECT id, story_id, owner_character_id AS character_id,
              owner_location_id AS location_id, item_definition_id, sort_order
         FROM item_instances
         WHERE story_id = ANY($1::text[])
         ORDER BY story_id, owner_character_id, owner_location_id, sort_order`,
      [storyIds],
    );
    const itemRelationships = await queryable.query<ItemRelationshipRow>(
      `SELECT story_id, parent_item_id, child_item_id, relationship_type, slot_key, sort_order
         FROM item_instance_relationships WHERE story_id = ANY($1::text[])
         ORDER BY story_id, parent_item_id, sort_order`,
      [storyIds],
    );
    const statEffects = await queryable.query<StatEffectRow>(
      `SELECT story_id, interaction_id, stat_id, item_id, operation, value, sort_order
         FROM interaction_stat_effects WHERE story_id = ANY($1::text[])
         ORDER BY story_id, interaction_id, sort_order`,
      [storyIds],
    );
    const itemEffects = await queryable.query<ItemEffectRow>(
      `SELECT story_id, interaction_id, item_id, item_definition_id, character_id,
              operation, sort_order
         FROM interaction_item_effects WHERE story_id = ANY($1::text[])
         ORDER BY story_id, interaction_id, sort_order`,
      [storyIds],
    );
    const triggers = await queryable.query<TriggerRow>(
      `SELECT triggers.id, interactions.story_id, triggers.output_interaction_id,
                triggers.position_x, triggers.position_y, triggers.sort_order,
                triggers.condition_groups, triggers.appearance_probability,
                triggers.timer_seconds
         FROM triggers
         JOIN interactions ON interactions.id = triggers.output_interaction_id
         WHERE interactions.story_id = ANY($1::text[])
         ORDER BY interactions.story_id, triggers.output_interaction_id, triggers.sort_order`,
      [storyIds],
    );
    const inputs = await queryable.query<TriggerInputRow>(
      `SELECT output.story_id, trigger_inputs.trigger_id,
                trigger_inputs.input_interaction_id, trigger_inputs.sort_order
         FROM trigger_inputs
         JOIN triggers ON triggers.id = trigger_inputs.trigger_id
         JOIN interactions output ON output.id = triggers.output_interaction_id
         WHERE output.story_id = ANY($1::text[])
         ORDER BY output.story_id, trigger_inputs.trigger_id, trigger_inputs.sort_order`,
      [storyIds],
    );
    const inputsByTrigger = groupBy(inputs.rows, ({ trigger_id }) => trigger_id);
    const triggersByInteraction = groupBy(
      triggers.rows,
      ({ output_interaction_id }) => output_interaction_id,
    );
    const interactionsByStory = groupBy(interactions.rows, ({ story_id }) => story_id);
    const graphDecorationsByStory = groupBy(graphDecorations.rows, ({ story_id }) => story_id);
    const locationsByStory = groupBy(locations.rows, ({ story_id }) => story_id);
    const charactersByStory = groupBy(characters.rows, ({ story_id }) => story_id);
    const statDefinitionsByStory = groupBy(statDefinitions.rows, ({ story_id }) => story_id);
    const storyStats = groupBy(
      statAssignments.rows.filter(({ owner_type }) => owner_type === 'story'),
      ({ story_id }) => story_id,
    );
    const statsByCharacter = groupBy(
      statAssignments.rows.filter(({ owner_type }) => owner_type === 'character'),
      ({ character_id }) => character_id ?? '',
    );
    const statsByLocation = groupBy(
      statAssignments.rows.filter(({ owner_type }) => owner_type === 'location'),
      ({ location_id }) => location_id ?? '',
    );
    const statsByItemDefinition = groupBy(
      statAssignments.rows.filter(({ owner_type }) => owner_type === 'item_definition'),
      ({ item_definition_id }) => item_definition_id ?? '',
    );
    const itemDefinitionsByStory = groupBy(itemDefinitions.rows, ({ story_id }) => story_id);
    const charactersByInteraction = groupBy(
      interactionCharacters.rows,
      ({ interaction_id }) => interaction_id,
    );
    const itemRowsById = new Map(characterItems.rows.map((item) => [item.id, item]));
    const relationshipByChild = new Map(
      itemRelationships.rows.map((relationship) => [relationship.child_item_id, relationship]),
    );
    const itemsByCharacter = groupBy(characterItems.rows, (item) =>
      resolveItemCharacterOwner(item, itemRowsById, relationshipByChild),
    );
    const itemsByLocation = groupBy(characterItems.rows, (item) =>
      resolveItemLocationOwner(item, itemRowsById, relationshipByChild),
    );
    const effectsByInteraction = groupBy(statEffects.rows, ({ interaction_id }) => interaction_id);
    const itemEffectsByInteraction = groupBy(
      itemEffects.rows,
      ({ interaction_id }) => interaction_id,
    );

    return storyRows.map((row) => ({
      id: row.id,
      revision: row.revision,
      title: row.title,
      access: accessSettings(row),
      capabilities: capabilities(row),
      owner: { id: row.creator_user_id, email: row.owner_email },
      startDateTime: row.start_date_time,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      ...(storyStats.get(row.id)?.length
        ? { stats: storyStats.get(row.id)!.map(projectStatAssignment) }
        : {}),
      graphDecorations: (graphDecorationsByStory.get(row.id) ?? []).map((decoration) =>
        decoration.kind === 'frame'
          ? {
              id: decoration.id,
              kind: 'frame',
              position: { x: decoration.position_x, y: decoration.position_y },
              color: decoration.color,
              width: decoration.width!,
              height: decoration.height!,
            }
          : {
              id: decoration.id,
              kind: 'text',
              position: { x: decoration.position_x, y: decoration.position_y },
              color: decoration.color,
              text: decoration.text_content!,
              fontSize: decoration.font_size!,
              fontFamily: decoration.font_family!,
              fontWeight: decoration.font_weight!,
              fontStyle: decoration.font_style!,
            },
      ),
      locations: (locationsByStory.get(row.id) ?? []).map((location) => ({
        id: location.id,
        name: location.name,
        description: location.description,
        ...(location.category ? { category: location.category } : {}),
        ...(location.image_url ? { imageUrl: location.image_url } : {}),
        ...(statsByLocation.get(location.id)?.length
          ? {
              stats: statsByLocation.get(location.id)!.map(projectStatAssignment),
            }
          : {}),
        ...(itemsByLocation.get(location.id)?.length
          ? {
              items: itemsByLocation
                .get(location.id)!
                .map((item) => projectItemInstance(item, relationshipByChild)),
            }
          : {}),
      })),
      characters: (charactersByStory.get(row.id) ?? []).map((character) => ({
        id: character.id,
        name: character.name,
        description: character.description,
        ...(character.category ? { category: character.category } : {}),
        ...(character.image_url ? { imageUrl: character.image_url } : {}),
        ...(character.is_playable ? { isPlayable: true } : {}),
        stats: (statsByCharacter.get(character.id) ?? []).map(projectStatAssignment),
        items: (itemsByCharacter.get(character.id) ?? []).map((item) =>
          projectItemInstance(item, relationshipByChild),
        ),
      })),
      statDefinitions: (statDefinitionsByStory.get(row.id) ?? []).map((definition) => ({
        id: definition.id,
        name: definition.name,
        valueType: definition.value_type,
        ...(definition.category ? { category: definition.category } : {}),
        ...(definition.image_url ? { imageUrl: definition.image_url } : {}),
        ...(definition.change_per_hour ? { changePerHour: definition.change_per_hour } : {}),
      })),
      itemDefinitions: (itemDefinitionsByStory.get(row.id) ?? []).map((definition) => ({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        ...(definition.category ? { category: definition.category } : {}),
        ...(definition.image_url ? { imageUrl: definition.image_url } : {}),
        stats: (statsByItemDefinition.get(definition.id) ?? []).map(projectStatAssignment),
      })),
      interactions: (interactionsByStory.get(row.id) ?? []).map((interaction) => ({
        id: interaction.id,
        title: interaction.title,
        body: interaction.body,
        position: { x: interaction.position_x, y: interaction.position_y },
        locationId: interaction.location_id,
        durationMinutes: interaction.duration_minutes,
        conditionalTextBlocks: interaction.conditional_text_blocks,
        characterIds: (charactersByInteraction.get(interaction.id) ?? []).map(
          ({ character_id }) => character_id,
        ),
        statEffects: (effectsByInteraction.get(interaction.id) ?? []).map((effect) => ({
          statId: effect.stat_id,
          ...(effect.item_id ? { itemId: effect.item_id } : {}),
          operation: effect.operation,
          value: effect.value,
        })),
        itemEffects: (itemEffectsByInteraction.get(interaction.id) ?? []).map((effect) => ({
          ...(effect.item_id ? { itemId: effect.item_id } : {}),
          ...(effect.item_definition_id ? { itemDefinitionId: effect.item_definition_id } : {}),
          ...(effect.character_id ? { characterId: effect.character_id } : {}),
          operation: effect.operation,
        })),
        triggers: (triggersByInteraction.get(interaction.id) ?? []).map((trigger) => ({
          id: trigger.id,
          inputInteractionIds: (inputsByTrigger.get(trigger.id) ?? []).map(
            ({ input_interaction_id }) => input_interaction_id,
          ),
          conditionGroups: trigger.condition_groups,
          appearanceProbability: trigger.appearance_probability,
          timerSeconds: trigger.timer_seconds,
          ...(typeof trigger.position_x === 'number' && typeof trigger.position_y === 'number'
            ? { position: { x: trigger.position_x, y: trigger.position_y } }
            : {}),
        })),
      })),
    }));
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async hasEditAccess(
    queryable: Queryable,
    id: string,
    userId: string,
    lock = false,
  ): Promise<boolean> {
    const result = await queryable.query(
      `SELECT stories.id
       FROM stories
       JOIN users AS actor ON actor.id = $2
       LEFT JOIN story_user_permissions AS permission
         ON permission.story_id = stories.id AND permission.user_id = $2
       WHERE stories.id = $1
         AND (
           actor.role = 'admin'
           OR stories.creator_user_id = $2
           OR stories.edit_policy = 'authenticated'
           OR (stories.visibility <> 'private' AND permission.role = 'editor')
         )
       ${lock ? 'FOR UPDATE OF stories' : ''}`,
      [id, userId],
    );
    return Boolean(result.rowCount);
  }

  private async saveWith(client: PoolClient, story: Story, ownerId: string): Promise<void> {
    await client.query(
      `INSERT INTO stories
       (id, revision, title, start_date_time, created_at, updated_at, creator_user_id,
        visibility, edit_policy, comment_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           start_date_time = EXCLUDED.start_date_time,
           visibility = EXCLUDED.visibility,
           edit_policy = EXCLUDED.edit_policy,
           comment_policy = EXCLUDED.comment_policy,
           created_at = EXCLUDED.created_at,
           updated_at = EXCLUDED.updated_at`,
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
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]);
  return grouped;
}

function resolveItemCharacterOwner(
  item: CharacterItemRow,
  itemsById: ReadonlyMap<string, CharacterItemRow>,
  relationshipsByChild: ReadonlyMap<string, ItemRelationshipRow>,
) {
  const visited = new Set<string>();
  let current: CharacterItemRow | undefined = item;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.character_id) return current.character_id;
    const parentId: string | undefined = relationshipsByChild.get(current.id)?.parent_item_id;
    current = parentId ? itemsById.get(parentId) : undefined;
  }
  return '';
}

function resolveItemLocationOwner(
  item: CharacterItemRow,
  itemsById: ReadonlyMap<string, CharacterItemRow>,
  relationshipsByChild: ReadonlyMap<string, ItemRelationshipRow>,
) {
  const visited = new Set<string>();
  let current: CharacterItemRow | undefined = item;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.location_id) return current.location_id;
    const parentId: string | undefined = relationshipsByChild.get(current.id)?.parent_item_id;
    current = parentId ? itemsById.get(parentId) : undefined;
  }
  return '';
}

function projectItemInstance(
  item: CharacterItemRow,
  relationshipsByChild: ReadonlyMap<string, ItemRelationshipRow>,
) {
  const relationship = relationshipsByChild.get(item.id);
  return {
    id: item.id,
    itemDefinitionId: item.item_definition_id,
    ...(relationship
      ? {
          parentItemId: relationship.parent_item_id,
          relationshipType: relationship.relationship_type,
          ...(relationship.slot_key ? { slotKey: relationship.slot_key } : {}),
        }
      : {}),
  };
}

function projectStatAssignment(row: StatAssignmentRow) {
  return {
    id: row.id,
    statDefinitionId: row.stat_definition_id,
    initialValue: row.initial_value,
  };
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function readerSave(row: ReaderProgressRow): ReaderSave {
  return {
    id: row.slot_id,
    kind: readerSaveKind(row.slot_id),
    ...(row.name ? { name: row.name } : {}),
    state: row.state,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

class StoryHistoryConflictError extends Error {
  constructor(readonly paths: string[]) {
    super('The Story change can no longer be applied safely.');
  }
}

function isPostgresHistoryConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return ['23503', '23505', '23514'].includes(String(error.code));
}

function accessSettings(
  row: Pick<StoryRow, 'visibility' | 'edit_policy' | 'comment_policy'>,
): StoryAccessSettings {
  return {
    visibility: row.visibility,
    editPolicy: row.edit_policy,
    commentPolicy: row.comment_policy,
  };
}

function capabilities(
  row: Pick<
    StoryRow,
    | 'visibility'
    | 'edit_policy'
    | 'comment_policy'
    | 'actor_id'
    | 'actor_role'
    | 'creator_user_id'
    | 'collaborator_role'
  >,
  actorId?: string,
) {
  return resolveStoryAccess(accessSettings(row), {
    authenticated: row.actor_id !== null,
    role: row.actor_role ?? undefined,
    isOwner: (actorId ?? row.actor_id) === row.creator_user_id,
    collaboratorRole: row.collaborator_role ?? undefined,
  });
}
