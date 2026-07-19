import type { Interaction, Story, Trigger } from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';

export async function replaceStoryGraph(client: Queryable, story: Story) {
  await client.query('DELETE FROM interactions WHERE story_id = $1', [story.id]);
  for (const [interactionIndex, interaction] of story.interactions.entries()) {
    await insertInteraction(client, story.id, interaction, interactionIndex);
  }
  for (const interaction of story.interactions) {
    for (const [triggerIndex, trigger] of interaction.triggers.entries()) {
      await insertTrigger(client, story.id, interaction.id, trigger, triggerIndex);
    }
  }
}

export async function persistStoryDifference(client: Queryable, before: Story, after: Story) {
  const storyChanges: string[] = [];
  const storyValues: unknown[] = [after.id];
  addChange(storyChanges, storyValues, 'title', before.title, after.title);
  addChange(storyChanges, storyValues, 'updated_at', before.updatedAt, after.updatedAt);
  addChange(storyChanges, storyValues, 'revision', before.revision, after.revision);
  if (storyChanges.length > 0) {
    await client.query(`UPDATE stories SET ${storyChanges.join(', ')} WHERE id = $1`, storyValues);
  }

  const beforeInteractions = new Map(before.interactions.map((item) => [item.id, item]));
  const afterInteractions = new Map(after.interactions.map((item) => [item.id, item]));
  for (const interaction of before.interactions) {
    if (!afterInteractions.has(interaction.id)) {
      await client.query('DELETE FROM interactions WHERE id = $1 AND story_id = $2', [
        interaction.id,
        after.id,
      ]);
    }
  }
  for (const [index, interaction] of after.interactions.entries()) {
    const previous = beforeInteractions.get(interaction.id);
    if (!previous) {
      await insertInteraction(client, after.id, interaction, index);
      for (const [triggerIndex, trigger] of interaction.triggers.entries()) {
        await insertTrigger(client, after.id, interaction.id, trigger, triggerIndex);
      }
      continue;
    }
    await updateInteractionDifference(
      client,
      previous,
      interaction,
      before.interactions.findIndex(({ id }) => id === interaction.id),
      index,
    );
    await persistTriggerDifference(client, after.id, previous, interaction);
  }
}

async function insertInteraction(
  client: Queryable,
  storyId: string,
  interaction: Interaction,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO interactions
     (id, story_id, title, body, position_x, position_y, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      interaction.id,
      storyId,
      interaction.title,
      interaction.body,
      interaction.position.x,
      interaction.position.y,
      sortOrder,
    ],
  );
}

async function insertTrigger(
  client: Queryable,
  storyId: string,
  outputInteractionId: string,
  trigger: Trigger,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO triggers (id, story_id, output_interaction_id, conditions, sort_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [trigger.id, storyId, outputInteractionId, JSON.stringify(trigger.conditions), sortOrder],
  );
  await replaceTriggerInputs(client, storyId, trigger);
}

async function replaceTriggerInputs(client: Queryable, storyId: string, trigger: Trigger) {
  await client.query('DELETE FROM trigger_inputs WHERE trigger_id = $1', [trigger.id]);
  for (const [index, inputId] of trigger.inputInteractionIds.entries()) {
    await client.query(
      `INSERT INTO trigger_inputs (story_id, trigger_id, input_interaction_id, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [storyId, trigger.id, inputId, index],
    );
  }
}

async function updateInteractionDifference(
  client: Queryable,
  before: Interaction,
  after: Interaction,
  beforeSortOrder: number,
  sortOrder: number,
) {
  const changes: string[] = [];
  const values: unknown[] = [after.id];
  addChange(changes, values, 'title', before.title, after.title);
  addChange(changes, values, 'body', before.body, after.body);
  addChange(changes, values, 'position_x', before.position.x, after.position.x);
  addChange(changes, values, 'position_y', before.position.y, after.position.y);
  addChange(changes, values, 'sort_order', beforeSortOrder, sortOrder);
  if (changes.length > 0) {
    await client.query(`UPDATE interactions SET ${changes.join(', ')} WHERE id = $1`, values);
  }
}

async function persistTriggerDifference(
  client: Queryable,
  storyId: string,
  beforeInteraction: Interaction,
  afterInteraction: Interaction,
) {
  const beforeTriggers = new Map(beforeInteraction.triggers.map((item) => [item.id, item]));
  const afterTriggers = new Map(afterInteraction.triggers.map((item) => [item.id, item]));
  for (const trigger of beforeInteraction.triggers) {
    if (!afterTriggers.has(trigger.id)) {
      await client.query('DELETE FROM triggers WHERE id = $1', [trigger.id]);
    }
  }
  for (const [index, trigger] of afterInteraction.triggers.entries()) {
    const previous = beforeTriggers.get(trigger.id);
    if (!previous) {
      await insertTrigger(client, storyId, afterInteraction.id, trigger, index);
      continue;
    }
    const previousIndex = beforeInteraction.triggers.findIndex(({ id }) => id === trigger.id);
    if (previousIndex !== index) {
      await client.query('UPDATE triggers SET sort_order = $2 WHERE id = $1', [trigger.id, index]);
    }
    if (
      JSON.stringify(previous.inputInteractionIds) !==
        JSON.stringify(trigger.inputInteractionIds) ||
      JSON.stringify(previous.conditions) !== JSON.stringify(trigger.conditions)
    ) {
      await client.query('UPDATE triggers SET conditions = $2 WHERE id = $1', [
        trigger.id,
        JSON.stringify(trigger.conditions),
      ]);
      await replaceTriggerInputs(client, storyId, trigger);
    }
  }
}

function addChange(
  changes: string[],
  values: unknown[],
  column: string,
  before: unknown,
  after: unknown,
) {
  if (before === after) return;
  values.push(after);
  changes.push(`${column} = $${values.length}`);
}
