import type {
  Character,
  Interaction,
  ItemDefinition,
  Location,
  StatDefinition,
  Story,
  Trigger,
} from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';

export async function replaceStoryGraph(client: Queryable, story: Story) {
  await client.query('DELETE FROM interactions WHERE story_id = $1', [story.id]);
  await client.query('DELETE FROM characters WHERE story_id = $1', [story.id]);
  await client.query('DELETE FROM item_definitions WHERE story_id = $1', [story.id]);
  await client.query('DELETE FROM stat_definitions WHERE story_id = $1', [story.id]);
  await client.query('DELETE FROM locations WHERE story_id = $1', [story.id]);
  for (const [locationIndex, location] of (story.locations ?? []).entries()) {
    await insertLocation(client, story.id, location, locationIndex);
  }
  for (const [index, definition] of (story.statDefinitions ?? []).entries()) {
    await insertStatDefinition(client, story.id, definition, index);
  }
  for (const [index, definition] of (story.itemDefinitions ?? []).entries()) {
    await insertItemDefinition(client, story.id, definition, index);
  }
  for (const [characterIndex, character] of (story.characters ?? []).entries()) {
    await insertCharacter(client, story.id, character, characterIndex);
    for (const [statIndex, stat] of (character.stats ?? []).entries()) {
      await insertCharacterStat(client, story.id, character.id, stat, statIndex);
    }
    for (const [itemIndex, item] of (character.items ?? []).entries()) {
      await insertCharacterItem(client, story.id, character.id, item, itemIndex);
    }
  }
  for (const [interactionIndex, interaction] of story.interactions.entries()) {
    await insertInteraction(client, story.id, interaction, interactionIndex);
  }
  for (const interaction of story.interactions) {
    await replaceInteractionCharacters(client, story.id, interaction);
    await replaceInteractionStatEffects(client, story.id, interaction);
    await replaceInteractionItemEffects(client, story.id, interaction);
    for (const [triggerIndex, trigger] of interaction.triggers.entries()) {
      await insertTrigger(client, story.id, interaction.id, trigger, triggerIndex);
    }
  }
}

export async function persistStoryDifference(client: Queryable, before: Story, after: Story) {
  const storyChanges: string[] = [];
  const storyValues: unknown[] = [after.id];
  addChange(storyChanges, storyValues, 'title', before.title, after.title);
  addChange(
    storyChanges,
    storyValues,
    'start_date_time',
    before.startDateTime,
    after.startDateTime,
  );
  addChange(storyChanges, storyValues, 'updated_at', before.updatedAt, after.updatedAt);
  addChange(storyChanges, storyValues, 'revision', before.revision, after.revision);
  if (storyChanges.length > 0) {
    await client.query(`UPDATE stories SET ${storyChanges.join(', ')} WHERE id = $1`, storyValues);
  }

  await persistLocationDifference(client, before, after);
  await persistStatDefinitionDifference(client, before, after);
  await persistItemDefinitionDifference(client, before, after);
  await persistCharacterDifference(client, before, after);

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
      await replaceInteractionCharacters(client, after.id, interaction);
      await replaceInteractionStatEffects(client, after.id, interaction);
      await replaceInteractionItemEffects(client, after.id, interaction);
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
    if (
      JSON.stringify(previous.characterIds ?? []) !== JSON.stringify(interaction.characterIds ?? [])
    ) {
      await replaceInteractionCharacters(client, after.id, interaction);
    }
    if (
      JSON.stringify(previous.statEffects ?? []) !== JSON.stringify(interaction.statEffects ?? [])
    ) {
      await replaceInteractionStatEffects(client, after.id, interaction);
    }
    if (
      JSON.stringify(previous.itemEffects ?? []) !== JSON.stringify(interaction.itemEffects ?? [])
    ) {
      await replaceInteractionItemEffects(client, after.id, interaction);
    }
    await persistTriggerDifference(client, after.id, previous, interaction);
  }
}

async function replaceInteractionCharacters(
  client: Queryable,
  storyId: string,
  interaction: Interaction,
) {
  await client.query('DELETE FROM interaction_characters WHERE interaction_id = $1', [
    interaction.id,
  ]);
  for (const [index, characterId] of (interaction.characterIds ?? []).entries()) {
    await client.query(
      `INSERT INTO interaction_characters
       (story_id, interaction_id, character_id, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [storyId, interaction.id, characterId, index],
    );
  }
}

async function replaceInteractionStatEffects(
  client: Queryable,
  storyId: string,
  interaction: Interaction,
) {
  await client.query('DELETE FROM interaction_stat_effects WHERE interaction_id = $1', [
    interaction.id,
  ]);
  for (const [index, effect] of (interaction.statEffects ?? []).entries()) {
    await client.query(
      `INSERT INTO interaction_stat_effects
       (story_id, interaction_id, stat_id, operation, value, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [storyId, interaction.id, effect.statId, effect.operation, effect.value, index],
    );
  }
}

async function replaceInteractionItemEffects(
  client: Queryable,
  storyId: string,
  interaction: Interaction,
) {
  await client.query('DELETE FROM interaction_item_effects WHERE interaction_id = $1', [
    interaction.id,
  ]);
  for (const [index, effect] of (interaction.itemEffects ?? []).entries()) {
    await client.query(
      `INSERT INTO interaction_item_effects
       (story_id, interaction_id, item_id, item_definition_id, operation, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        storyId,
        interaction.id,
        effect.itemId ?? null,
        effect.itemDefinitionId ?? null,
        effect.operation,
        index,
      ],
    );
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
     (id, story_id, title, body, position_x, position_y, location_id, duration_minutes,
      item_stat_effects, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      interaction.id,
      storyId,
      interaction.title,
      interaction.body,
      interaction.position.x,
      interaction.position.y,
      interaction.locationId ?? null,
      interaction.durationMinutes ?? 0,
      JSON.stringify(interaction.itemStatEffects ?? []),
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
  addChange(changes, values, 'location_id', before.locationId ?? null, after.locationId ?? null);
  addChange(
    changes,
    values,
    'duration_minutes',
    before.durationMinutes ?? 0,
    after.durationMinutes ?? 0,
  );
  addChange(
    changes,
    values,
    'item_stat_effects',
    JSON.stringify(before.itemStatEffects ?? []),
    JSON.stringify(after.itemStatEffects ?? []),
  );
  addChange(changes, values, 'sort_order', beforeSortOrder, sortOrder);
  if (changes.length > 0) {
    await client.query(`UPDATE interactions SET ${changes.join(', ')} WHERE id = $1`, values);
  }
}

async function insertLocation(
  client: Queryable,
  storyId: string,
  location: Location,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO locations (id, story_id, name, description, image_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [location.id, storyId, location.name, location.description, location.imageUrl ?? '', sortOrder],
  );
}

async function persistLocationDifference(client: Queryable, before: Story, after: Story) {
  const beforeLocations = new Map(
    (before.locations ?? []).map((location) => [location.id, location]),
  );
  const afterLocations = new Map(
    (after.locations ?? []).map((location) => [location.id, location]),
  );

  for (const location of before.locations ?? []) {
    if (!afterLocations.has(location.id)) {
      await client.query('DELETE FROM locations WHERE id = $1 AND story_id = $2', [
        location.id,
        after.id,
      ]);
    }
  }
  for (const [index, location] of (after.locations ?? []).entries()) {
    const previous = beforeLocations.get(location.id);
    if (!previous) {
      await insertLocation(client, after.id, location, index);
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [location.id];
    addChange(changes, values, 'name', previous.name, location.name);
    addChange(changes, values, 'description', previous.description, location.description);
    addChange(changes, values, 'image_url', previous.imageUrl ?? '', location.imageUrl ?? '');
    addChange(
      changes,
      values,
      'sort_order',
      (before.locations ?? []).findIndex(({ id }) => id === location.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(`UPDATE locations SET ${changes.join(', ')} WHERE id = $1`, values);
    }
  }
}

async function insertCharacter(
  client: Queryable,
  storyId: string,
  character: Character,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO characters (id, story_id, name, description, image_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      character.id,
      storyId,
      character.name,
      character.description,
      character.imageUrl ?? '',
      sortOrder,
    ],
  );
}

async function insertCharacterStat(
  client: Queryable,
  storyId: string,
  characterId: string,
  stat: NonNullable<Character['stats']>[number],
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO character_stats
     (id, story_id, character_id, stat_definition_id, initial_value, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [stat.id, storyId, characterId, stat.statDefinitionId, stat.initialValue, sortOrder],
  );
}

async function insertStatDefinition(
  client: Queryable,
  storyId: string,
  definition: StatDefinition,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO stat_definitions
     (id, story_id, name, image_url, change_per_hour, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      definition.id,
      storyId,
      definition.name,
      definition.imageUrl ?? '',
      definition.changePerHour ?? 0,
      sortOrder,
    ],
  );
}

async function insertItemDefinition(
  client: Queryable,
  storyId: string,
  definition: ItemDefinition,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO item_definitions (id, story_id, name, description, image_url, stats, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      definition.id,
      storyId,
      definition.name,
      definition.description,
      definition.imageUrl ?? '',
      JSON.stringify(definition.stats ?? []),
      sortOrder,
    ],
  );
}

async function insertCharacterItem(
  client: Queryable,
  storyId: string,
  characterId: string,
  item: NonNullable<Character['items']>[number],
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO character_items
     (id, story_id, character_id, item_definition_id, sort_order)
     VALUES ($1, $2, $3, $4, $5)`,
    [item.id, storyId, characterId, item.itemDefinitionId, sortOrder],
  );
}

async function persistStatDefinitionDifference(client: Queryable, before: Story, after: Story) {
  const beforeDefinitions = new Map(
    (before.statDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  const afterDefinitions = new Map(
    (after.statDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  for (const definition of before.statDefinitions ?? []) {
    if (!afterDefinitions.has(definition.id)) {
      await client.query('DELETE FROM stat_definitions WHERE id = $1 AND story_id = $2', [
        definition.id,
        after.id,
      ]);
    }
  }
  for (const [index, definition] of (after.statDefinitions ?? []).entries()) {
    const previous = beforeDefinitions.get(definition.id);
    if (!previous) {
      await insertStatDefinition(client, after.id, definition, index);
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [definition.id];
    addChange(changes, values, 'name', previous.name, definition.name);
    addChange(changes, values, 'image_url', previous.imageUrl ?? '', definition.imageUrl ?? '');
    addChange(
      changes,
      values,
      'change_per_hour',
      previous.changePerHour ?? 0,
      definition.changePerHour ?? 0,
    );
    addChange(
      changes,
      values,
      'sort_order',
      (before.statDefinitions ?? []).findIndex(({ id }) => id === definition.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(`UPDATE stat_definitions SET ${changes.join(', ')} WHERE id = $1`, values);
    }
  }
}

async function persistItemDefinitionDifference(client: Queryable, before: Story, after: Story) {
  const beforeDefinitions = new Map(
    (before.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  const afterDefinitions = new Map(
    (after.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  for (const definition of before.itemDefinitions ?? []) {
    if (!afterDefinitions.has(definition.id)) {
      await client.query('DELETE FROM item_definitions WHERE id = $1 AND story_id = $2', [
        definition.id,
        after.id,
      ]);
    }
  }
  for (const [index, definition] of (after.itemDefinitions ?? []).entries()) {
    const previous = beforeDefinitions.get(definition.id);
    if (!previous) {
      await insertItemDefinition(client, after.id, definition, index);
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [definition.id];
    addChange(changes, values, 'name', previous.name, definition.name);
    addChange(changes, values, 'description', previous.description, definition.description);
    addChange(changes, values, 'image_url', previous.imageUrl ?? '', definition.imageUrl ?? '');
    addChange(
      changes,
      values,
      'stats',
      JSON.stringify(previous.stats ?? []),
      JSON.stringify(definition.stats ?? []),
    );
    addChange(
      changes,
      values,
      'sort_order',
      (before.itemDefinitions ?? []).findIndex(({ id }) => id === definition.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(`UPDATE item_definitions SET ${changes.join(', ')} WHERE id = $1`, values);
    }
  }
}

async function persistCharacterDifference(client: Queryable, before: Story, after: Story) {
  const beforeCharacters = new Map(
    (before.characters ?? []).map((character) => [character.id, character]),
  );
  const afterCharacters = new Map(
    (after.characters ?? []).map((character) => [character.id, character]),
  );
  for (const character of before.characters ?? []) {
    if (!afterCharacters.has(character.id)) {
      await client.query('DELETE FROM characters WHERE id = $1 AND story_id = $2', [
        character.id,
        after.id,
      ]);
    }
  }
  for (const [index, character] of (after.characters ?? []).entries()) {
    const previous = beforeCharacters.get(character.id);
    if (!previous) {
      await insertCharacter(client, after.id, character, index);
      for (const [statIndex, stat] of (character.stats ?? []).entries()) {
        await insertCharacterStat(client, after.id, character.id, stat, statIndex);
      }
      for (const [itemIndex, item] of (character.items ?? []).entries()) {
        await insertCharacterItem(client, after.id, character.id, item, itemIndex);
      }
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [character.id];
    addChange(changes, values, 'name', previous.name, character.name);
    addChange(changes, values, 'description', previous.description, character.description);
    addChange(changes, values, 'image_url', previous.imageUrl ?? '', character.imageUrl ?? '');
    addChange(
      changes,
      values,
      'sort_order',
      (before.characters ?? []).findIndex(({ id }) => id === character.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(`UPDATE characters SET ${changes.join(', ')} WHERE id = $1`, values);
    }
    await persistStatDifference(client, after.id, previous, character);
    await persistCharacterItemDifference(client, after.id, previous, character);
  }
}

async function persistCharacterItemDifference(
  client: Queryable,
  storyId: string,
  before: Character,
  after: Character,
) {
  const beforeItems = new Map((before.items ?? []).map((item) => [item.id, item]));
  const afterItems = new Map((after.items ?? []).map((item) => [item.id, item]));
  for (const item of before.items ?? []) {
    if (!afterItems.has(item.id)) {
      await client.query('DELETE FROM character_items WHERE id = $1 AND story_id = $2', [
        item.id,
        storyId,
      ]);
    }
  }
  for (const [index, item] of (after.items ?? []).entries()) {
    const previous = beforeItems.get(item.id);
    if (!previous) {
      await insertCharacterItem(client, storyId, after.id, item, index);
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [item.id];
    addChange(
      changes,
      values,
      'item_definition_id',
      previous.itemDefinitionId,
      item.itemDefinitionId,
    );
    addChange(
      changes,
      values,
      'sort_order',
      (before.items ?? []).findIndex(({ id }) => id === item.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(`UPDATE character_items SET ${changes.join(', ')} WHERE id = $1`, values);
    }
  }
}

async function persistStatDifference(
  client: Queryable,
  storyId: string,
  before: Character,
  after: Character,
) {
  const beforeStats = new Map((before.stats ?? []).map((stat) => [stat.id, stat]));
  const afterStats = new Map((after.stats ?? []).map((stat) => [stat.id, stat]));
  for (const stat of before.stats ?? []) {
    if (!afterStats.has(stat.id)) {
      await client.query('DELETE FROM character_stats WHERE id = $1 AND story_id = $2', [
        stat.id,
        storyId,
      ]);
    }
  }
  for (const [index, stat] of (after.stats ?? []).entries()) {
    const previous = beforeStats.get(stat.id);
    if (!previous) {
      await insertCharacterStat(client, storyId, after.id, stat, index);
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [stat.id];
    addChange(
      changes,
      values,
      'stat_definition_id',
      previous.statDefinitionId,
      stat.statDefinitionId,
    );
    addChange(changes, values, 'initial_value', previous.initialValue, stat.initialValue);
    addChange(
      changes,
      values,
      'sort_order',
      (before.stats ?? []).findIndex(({ id }) => id === stat.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(`UPDATE character_stats SET ${changes.join(', ')} WHERE id = $1`, values);
    }
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
