import { Injectable } from '@nestjs/common';
import type { Story } from '@paralleax/shared';
import type { PoolClient } from 'pg';
import { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';
import type { Queryable } from './stories.persistence.types';
import { persistStoryDifference, replaceStoryGraph } from './stories.persistence.writer';

type StoryRow = {
  id: string;
  title: string;
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
  sort_order: number;
};
type TriggerRow = {
  id: string;
  story_id: string;
  output_interaction_id: string;
  sort_order: number;
};
type TriggerInputRow = {
  story_id: string;
  trigger_id: string;
  input_interaction_id: string;
  sort_order: number;
};
type TriggerConditionRow = {
  story_id: string;
  trigger_id: string;
  interaction_id: string;
  has_been_visited: boolean;
  sort_order: number;
};

@Injectable()
export class StoriesRepository {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly migrator: DatabaseMigrator,
  ) {}

  async list(ownerId = 'migration-user'): Promise<Story[]> {
    await this.migrator.run();
    const result = await this.database.pool.query<StoryRow>(
      `SELECT id, title, created_at, updated_at
       FROM stories
       WHERE creator_user_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [ownerId],
    );
    return this.assemble(this.database.pool, result.rows);
  }

  async find(id: string, ownerId = 'migration-user'): Promise<Story | undefined> {
    await this.migrator.run();
    return this.findWith(this.database.pool, id, ownerId);
  }

  async save(story: Story, ownerId = 'migration-user'): Promise<void> {
    await this.migrator.run();
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO stories (id, title, created_at, updated_at, creator_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
        [story.id, story.title, story.createdAt, story.updatedAt, ownerId],
      );
      await replaceStoryGraph(client, story);
    });
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
    ownerId = 'migration-user',
  ): Promise<Story | undefined> {
    await this.migrator.run();
    return this.transaction(async (client) => {
      const current = await this.findWith(client, id, ownerId);
      if (!current) return undefined;
      const updated = await mutation(structuredClone(current));
      await persistStoryDifference(client, current, updated);
      return this.findWith(client, id, ownerId);
    });
  }

  async delete(id: string, ownerId = 'migration-user'): Promise<boolean> {
    await this.migrator.run();
    const result = await this.database.pool.query(
      'DELETE FROM stories WHERE id = $1 AND creator_user_id = $2',
      [id, ownerId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async findWith(queryable: Queryable, id: string, ownerId: string) {
    const result = await queryable.query<StoryRow>(
      `SELECT id, title, created_at, updated_at
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
      `SELECT id, story_id, title, body, position_x, position_y, sort_order
         FROM interactions WHERE story_id = ANY($1::text[])
         ORDER BY story_id, sort_order`,
      [storyIds],
    );
    const triggers = await queryable.query<TriggerRow>(
      `SELECT triggers.id, interactions.story_id, triggers.output_interaction_id,
                triggers.sort_order
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
    const conditions = await queryable.query<TriggerConditionRow>(
      `SELECT output.story_id, trigger_conditions.trigger_id,
                trigger_conditions.interaction_id,
                trigger_conditions.has_been_visited, trigger_conditions.sort_order
         FROM trigger_conditions
         JOIN triggers ON triggers.id = trigger_conditions.trigger_id
         JOIN interactions output ON output.id = triggers.output_interaction_id
         WHERE output.story_id = ANY($1::text[])
         ORDER BY output.story_id, trigger_conditions.trigger_id, trigger_conditions.sort_order`,
      [storyIds],
    );

    const inputsByTrigger = groupBy(inputs.rows, ({ trigger_id }) => trigger_id);
    const conditionsByTrigger = groupBy(conditions.rows, ({ trigger_id }) => trigger_id);
    const triggersByInteraction = groupBy(
      triggers.rows,
      ({ output_interaction_id }) => output_interaction_id,
    );
    const interactionsByStory = groupBy(interactions.rows, ({ story_id }) => story_id);

    return storyRows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      interactions: (interactionsByStory.get(row.id) ?? []).map((interaction) => ({
        id: interaction.id,
        title: interaction.title,
        body: interaction.body,
        position: { x: interaction.position_x, y: interaction.position_y },
        triggers: (triggersByInteraction.get(interaction.id) ?? []).map((trigger) => ({
          id: trigger.id,
          inputInteractionIds: (inputsByTrigger.get(trigger.id) ?? []).map(
            ({ input_interaction_id }) => input_interaction_id,
          ),
          conditions: (conditionsByTrigger.get(trigger.id) ?? []).map((condition) => ({
            interactionId: condition.interaction_id,
            hasBeenVisited: condition.has_been_visited,
          })),
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
