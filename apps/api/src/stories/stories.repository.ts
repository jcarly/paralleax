import { Injectable } from '@nestjs/common';
import {
  DEFAULT_STORY_DATE_TIME,
  type ItemDefinitionStat,
  type ItemStatEffect,
  type ReaderProgress,
  type ReaderProgressState,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';
import type { PoolClient } from 'pg';
import { DatabaseConnection } from '../database/database.connection';
import type { Queryable } from './persistence/stories.persistence.types';
import {
  persistStoryDifference,
  replaceStoryGraph,
} from './persistence/stories.persistence.writer';

type StoryRow = {
  id: string;
  revision: number;
  title: string;
  start_date_time: string;
  created_at: Date | string;
  updated_at: Date | string;
};
type InteractionRow = {
  id: string;
  story_id: string;
  title: string;
  body: string;
  position_x: number;
  position_y: number;
  location_id: string | null;
  duration_minutes: number;
  item_stat_effects: ItemStatEffect[];
  sort_order: number;
};
type LocationRow = {
  id: string;
  story_id: string;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
};
type CharacterRow = LocationRow;
type StatDefinitionRow = {
  id: string;
  story_id: string;
  name: string;
  image_url: string;
  change_per_hour: number;
  sort_order: number;
};
type ItemDefinitionRow = LocationRow & {
  stats: ItemDefinitionStat[];
};
type InteractionCharacterRow = {
  story_id: string;
  interaction_id: string;
  character_id: string;
  sort_order: number;
};
type CharacterStatRow = {
  id: string;
  story_id: string;
  character_id: string;
  stat_definition_id: string;
  initial_value: number;
  sort_order: number;
};
type CharacterItemRow = {
  id: string;
  story_id: string;
  character_id: string;
  item_definition_id: string;
  sort_order: number;
};
type StatEffectRow = {
  story_id: string;
  interaction_id: string;
  stat_id: string;
  operation: 'add' | 'set';
  value: number;
  sort_order: number;
};
type ItemEffectRow = {
  story_id: string;
  interaction_id: string;
  item_id: string;
  operation: 'obtain' | 'lose';
  sort_order: number;
};
type TriggerRow = {
  id: string;
  story_id: string;
  output_interaction_id: string;
  sort_order: number;
  conditions: TriggerCondition[];
};
type TriggerInputRow = {
  story_id: string;
  trigger_id: string;
  input_interaction_id: string;
  sort_order: number;
};
type ReaderProgressRow = {
  state: ReaderProgressState;
  updated_at: Date | string;
};

@Injectable()
export class StoriesRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async list(ownerId: string): Promise<Story[]> {
    const result = await this.database.pool.query<StoryRow>(
      `SELECT id, revision, title, start_date_time, created_at, updated_at
       FROM stories
       WHERE creator_user_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [ownerId],
    );
    return this.assemble(this.database.pool, result.rows);
  }

  async find(id: string, ownerId: string): Promise<Story | undefined> {
    return this.findWith(this.database.pool, id, ownerId);
  }

  async save(story: Story, ownerId: string): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO stories
         (id, revision, title, start_date_time, created_at, updated_at, creator_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             start_date_time = EXCLUDED.start_date_time,
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
        ],
      );
      await replaceStoryGraph(client, story);
    });
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
    ownerId: string,
  ): Promise<Story | undefined> {
    return this.transaction(async (client) => {
      const lock = await client.query(
        'SELECT id FROM stories WHERE id = $1 AND creator_user_id = $2 FOR UPDATE',
        [id, ownerId],
      );
      if (!lock.rowCount) return undefined;
      const current = await this.findWith(client, id, ownerId);
      if (!current) return undefined;
      const updated = await mutation(structuredClone(current));
      await persistStoryDifference(client, current, updated);
      return this.findWith(client, id, ownerId);
    });
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    const result = await this.database.pool.query(
      'DELETE FROM stories WHERE id = $1 AND creator_user_id = $2',
      [id, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findProgress(storyId: string, userId: string): Promise<ReaderProgress | undefined> {
    const result = await this.database.pool.query<ReaderProgressRow>(
      `SELECT progress.state, progress.updated_at
       FROM story_reader_progress AS progress
       JOIN stories ON stories.id = progress.story_id
       WHERE progress.story_id = $1
         AND progress.user_id = $2
         AND stories.creator_user_id = $2`,
      [storyId, userId],
    );
    const row = result.rows[0];
    return row ? { state: row.state, updatedAt: iso(row.updated_at) } : undefined;
  }

  async saveProgress(
    storyId: string,
    userId: string,
    state: ReaderProgressState,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.database.pool.query(
      `INSERT INTO story_reader_progress (user_id, story_id, state, updated_at)
       SELECT $2, $1, $3::jsonb, $4
       FROM stories
       WHERE id = $1 AND creator_user_id = $2
       ON CONFLICT (user_id, story_id) DO UPDATE
       SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
      [storyId, userId, JSON.stringify(state), updatedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteProgress(storyId: string, userId: string): Promise<void> {
    await this.database.pool.query(
      'DELETE FROM story_reader_progress WHERE story_id = $1 AND user_id = $2',
      [storyId, userId],
    );
  }

  private async findWith(queryable: Queryable, id: string, ownerId: string) {
    const result = await queryable.query<StoryRow>(
      `SELECT id, revision, title, start_date_time, created_at, updated_at
       FROM stories
       WHERE id = $1 AND creator_user_id = $2`,
      [id, ownerId],
    );
    return (await this.assemble(queryable, result.rows))[0];
  }

  private async assemble(queryable: Queryable, storyRows: StoryRow[]): Promise<Story[]> {
    if (storyRows.length === 0) return [];
    const storyIds = storyRows.map(({ id }) => id);
    const interactions = await queryable.query<InteractionRow>(
      `SELECT id, story_id, title, body, position_x, position_y, location_id,
              duration_minutes, item_stat_effects, sort_order
         FROM interactions WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const locations = await queryable.query<LocationRow>(
      `SELECT id, story_id, name, description, image_url, stats, sort_order
         FROM locations WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const characters = await queryable.query<CharacterRow>(
      `SELECT id, story_id, name, description, image_url, sort_order
         FROM characters WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const statDefinitions = await queryable.query<StatDefinitionRow>(
      `SELECT id, story_id, name, image_url, change_per_hour, sort_order
         FROM stat_definitions WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const itemDefinitions = await queryable.query<ItemDefinitionRow>(
      `SELECT id, story_id, name, description, image_url, sort_order
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
    const characterStats = await queryable.query<CharacterStatRow>(
      `SELECT id, story_id, character_id, stat_definition_id, initial_value, sort_order
         FROM character_stats WHERE story_id = ANY($1::text[])
         ORDER BY story_id, character_id, sort_order`,
      [storyIds],
    );
    const characterItems = await queryable.query<CharacterItemRow>(
      `SELECT id, story_id, character_id, item_definition_id, sort_order
         FROM character_items WHERE story_id = ANY($1::text[])
         ORDER BY story_id, character_id, sort_order`,
      [storyIds],
    );
    const statEffects = await queryable.query<StatEffectRow>(
      `SELECT story_id, interaction_id, stat_id, operation, value, sort_order
         FROM interaction_stat_effects WHERE story_id = ANY($1::text[])
         ORDER BY story_id, interaction_id, sort_order`,
      [storyIds],
    );
    const itemEffects = await queryable.query<ItemEffectRow>(
      `SELECT story_id, interaction_id, item_id, operation, sort_order
         FROM interaction_item_effects WHERE story_id = ANY($1::text[])
         ORDER BY story_id, interaction_id, sort_order`,
      [storyIds],
    );
    const triggers = await queryable.query<TriggerRow>(
      `SELECT triggers.id, interactions.story_id, triggers.output_interaction_id,
                triggers.sort_order, triggers.conditions
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
    const locationsByStory = groupBy(locations.rows, ({ story_id }) => story_id);
    const charactersByStory = groupBy(characters.rows, ({ story_id }) => story_id);
    const statDefinitionsByStory = groupBy(statDefinitions.rows, ({ story_id }) => story_id);
    const itemDefinitionsByStory = groupBy(itemDefinitions.rows, ({ story_id }) => story_id);
    const charactersByInteraction = groupBy(
      interactionCharacters.rows,
      ({ interaction_id }) => interaction_id,
    );
    const statsByCharacter = groupBy(characterStats.rows, ({ character_id }) => character_id);
    const itemsByCharacter = groupBy(characterItems.rows, ({ character_id }) => character_id);
    const effectsByInteraction = groupBy(statEffects.rows, ({ interaction_id }) => interaction_id);
    const itemEffectsByInteraction = groupBy(
      itemEffects.rows,
      ({ interaction_id }) => interaction_id,
    );

    return storyRows.map((row) => ({
      id: row.id,
      revision: row.revision,
      title: row.title,
      startDateTime: row.start_date_time,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      locations: (locationsByStory.get(row.id) ?? []).map((location) => ({
        id: location.id,
        name: location.name,
        description: location.description,
        ...(location.image_url ? { imageUrl: location.image_url } : {}),
      })),
      characters: (charactersByStory.get(row.id) ?? []).map((character) => ({
        id: character.id,
        name: character.name,
        description: character.description,
        ...(character.image_url ? { imageUrl: character.image_url } : {}),
        stats: (statsByCharacter.get(character.id) ?? []).map((stat) => ({
          id: stat.id,
          statDefinitionId: stat.stat_definition_id,
          initialValue: stat.initial_value,
        })),
        items: (itemsByCharacter.get(character.id) ?? []).map((item) => ({
          id: item.id,
          itemDefinitionId: item.item_definition_id,
        })),
      })),
      statDefinitions: (statDefinitionsByStory.get(row.id) ?? []).map((definition) => ({
        id: definition.id,
        name: definition.name,
        ...(definition.image_url ? { imageUrl: definition.image_url } : {}),
        changePerHour: definition.change_per_hour,
      })),
      itemDefinitions: (itemDefinitionsByStory.get(row.id) ?? []).map((definition) => ({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        ...(definition.image_url ? { imageUrl: definition.image_url } : {}),
        stats: definition.stats ?? [],
      })),
      interactions: (interactionsByStory.get(row.id) ?? []).map((interaction) => ({
        id: interaction.id,
        title: interaction.title,
        body: interaction.body,
        position: { x: interaction.position_x, y: interaction.position_y },
        locationId: interaction.location_id,
        durationMinutes: interaction.duration_minutes,
        characterIds: (charactersByInteraction.get(interaction.id) ?? []).map(
          ({ character_id }) => character_id,
        ),
        statEffects: (effectsByInteraction.get(interaction.id) ?? []).map((effect) => ({
          statId: effect.stat_id,
          operation: effect.operation,
          value: effect.value,
        })),
        itemEffects: (itemEffectsByInteraction.get(interaction.id) ?? []).map((effect) => ({
          itemId: effect.item_id,
          operation: effect.operation,
        })),
        itemStatEffects: interaction.item_stat_effects ?? [],
        triggers: (triggersByInteraction.get(interaction.id) ?? []).map((trigger) => ({
          id: trigger.id,
          inputInteractionIds: (inputsByTrigger.get(trigger.id) ?? []).map(
            ({ input_interaction_id }) => input_interaction_id,
          ),
          conditions: trigger.conditions,
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
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]);
  return grouped;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
