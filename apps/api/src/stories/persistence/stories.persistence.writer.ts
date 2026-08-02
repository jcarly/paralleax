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
  }
  const authoredItems = itemEntries(story);
  for (const entry of authoredItems) {
    await insertItemInstance(client, story.id, entry);
  }
  for (const { item, sortOrder } of authoredItems) {
    if (item.parentItemId && item.relationshipType) {
      await insertItemRelationship(client, story.id, item, sortOrder);
    }
  }
  await insertInteractionGraph(client, story);
}

async function insertInteractionGraph(client: Queryable, story: Story) {
  await insertJsonRows(
    client,
    `INSERT INTO interactions
     (id, story_id, title, body, position_x, position_y, location_id, duration_minutes,
      item_stat_effects, sort_order)
     SELECT id, story_id, title, body, position_x, position_y, location_id, duration_minutes,
            item_stat_effects, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       id text, story_id text, title text, body text, position_x double precision,
       position_y double precision, location_id text, duration_minutes integer,
       item_stat_effects jsonb, sort_order integer
     )`,
    story.interactions.map((interaction, sortOrder) => ({
      id: interaction.id,
      story_id: story.id,
      title: interaction.title,
      body: interaction.body,
      position_x: interaction.position.x,
      position_y: interaction.position.y,
      location_id: interaction.locationId ?? null,
      duration_minutes: interaction.durationMinutes ?? 0,
      item_stat_effects: interaction.itemStatEffects ?? [],
      sort_order: sortOrder,
    })),
  );
  await insertJsonRows(
    client,
    `INSERT INTO interaction_characters (story_id, interaction_id, character_id, sort_order)
     SELECT story_id, interaction_id, character_id, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, character_id text, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.characterIds ?? []).map((characterId, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        character_id: characterId,
        sort_order: sortOrder,
      })),
    ),
  );
  await insertJsonRows(
    client,
    `INSERT INTO interaction_stat_effects
     (story_id, interaction_id, stat_id, operation, value, sort_order)
     SELECT story_id, interaction_id, stat_id, operation, value, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, stat_id text, operation text,
       value double precision, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.statEffects ?? []).map((effect, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        stat_id: effect.statId,
        operation: effect.operation,
        value: effect.value,
        sort_order: sortOrder,
      })),
    ),
  );
  await insertJsonRows(
    client,
    `INSERT INTO interaction_item_effects
     (story_id, interaction_id, item_id, item_definition_id, character_id, operation, sort_order)
     SELECT story_id, interaction_id, item_id, item_definition_id, character_id, operation,
            sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, item_id text, item_definition_id text,
       character_id text, operation text, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.itemEffects ?? []).map((effect, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        item_id: effect.itemId ?? null,
        item_definition_id: effect.itemDefinitionId ?? null,
        character_id: effect.characterId ?? null,
        operation: effect.operation,
        sort_order: sortOrder,
      })),
    ),
  );
  const triggers = story.interactions.flatMap((interaction) =>
    interaction.triggers.map((trigger, sortOrder) => ({ interaction, trigger, sortOrder })),
  );
  await insertJsonRows(
    client,
    `INSERT INTO triggers (id, story_id, output_interaction_id, conditions, sort_order)
     SELECT id, story_id, output_interaction_id, conditions, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       id text, story_id text, output_interaction_id text, conditions jsonb, sort_order integer
     )`,
    triggers.map(({ interaction, trigger, sortOrder }) => ({
      id: trigger.id,
      story_id: story.id,
      output_interaction_id: interaction.id,
      conditions: trigger.conditions,
      sort_order: sortOrder,
    })),
  );
  await insertJsonRows(
    client,
    `INSERT INTO trigger_inputs (story_id, trigger_id, input_interaction_id, sort_order)
     SELECT story_id, trigger_id, input_interaction_id, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, trigger_id text, input_interaction_id text, sort_order integer
     )`,
    triggers.flatMap(({ trigger }) =>
      trigger.inputInteractionIds.map((inputInteractionId, sortOrder) => ({
        story_id: story.id,
        trigger_id: trigger.id,
        input_interaction_id: inputInteractionId,
        sort_order: sortOrder,
      })),
    ),
  );
}

async function insertJsonRows(client: Queryable, sql: string, rows: object[]) {
  if (rows.length === 0) return;
  await client.query(sql, [JSON.stringify(rows)]);
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
       (story_id, interaction_id, item_id, item_definition_id, character_id, operation, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        storyId,
        interaction.id,
        effect.itemId ?? null,
        effect.itemDefinitionId ?? null,
        effect.characterId ?? null,
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
    `INSERT INTO characters
     (id, story_id, name, description, image_url, is_playable, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      character.id,
      storyId,
      character.name,
      character.description,
      character.imageUrl ?? '',
      character.isPlayable ?? false,
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

async function insertItemInstance(
  client: Queryable,
  storyId: string,
  entry: ReturnType<typeof itemEntries>[number],
) {
  const { ownerCharacterId, ownerLocationId, item, sortOrder } = entry;
  await client.query(
    `INSERT INTO item_instances
     (id, story_id, owner_character_id, owner_location_id, item_definition_id, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      item.id,
      storyId,
      item.parentItemId ? null : ownerCharacterId,
      item.parentItemId ? null : ownerLocationId,
      item.itemDefinitionId,
      sortOrder,
    ],
  );
}

async function insertItemRelationship(
  client: Queryable,
  storyId: string,
  item: NonNullable<Character['items']>[number],
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO item_instance_relationships
     (story_id, parent_item_id, child_item_id, relationship_type, slot_key, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [storyId, item.parentItemId, item.id, item.relationshipType, item.slotKey ?? null, sortOrder],
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
  const previousPlayableId = (before.characters ?? []).find(({ isPlayable }) => isPlayable)?.id;
  const nextPlayableId = (after.characters ?? []).find(({ isPlayable }) => isPlayable)?.id;
  if (previousPlayableId !== nextPlayableId && previousPlayableId) {
    await client.query('UPDATE characters SET is_playable = false WHERE story_id = $1', [after.id]);
  }
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
      'is_playable',
      previous.isPlayable ?? false,
      character.isPlayable ?? false,
    );
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
  }
  await persistItemInstanceDifference(client, before, after);
}

async function persistItemInstanceDifference(client: Queryable, before: Story, after: Story) {
  const beforeEntries = itemEntries(before);
  const afterEntries = itemEntries(after);
  const beforeItems = new Map(beforeEntries.map((entry) => [entry.item.id, entry]));
  const afterItems = new Map(afterEntries.map((entry) => [entry.item.id, entry]));
  const relationshipsChanged =
    itemRelationshipSignature(beforeEntries) !== itemRelationshipSignature(afterEntries);
  if (relationshipsChanged) {
    const childIds = new Set([...beforeItems.keys(), ...afterItems.keys()]);
    for (const childId of childIds) {
      await client.query(
        'DELETE FROM item_instance_relationships WHERE story_id = $1 AND child_item_id = $2',
        [after.id, childId],
      );
    }
  }
  for (const { item } of beforeEntries) {
    if (!afterItems.has(item.id)) {
      await client.query('DELETE FROM item_instances WHERE id = $1 AND story_id = $2', [
        item.id,
        after.id,
      ]);
    }
  }
  for (const entry of afterEntries) {
    const { ownerCharacterId, ownerLocationId, item, sortOrder } = entry;
    const previous = beforeItems.get(item.id);
    if (!previous) {
      await insertItemInstance(client, after.id, entry);
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [item.id];
    addChange(
      changes,
      values,
      'item_definition_id',
      previous.item.itemDefinitionId,
      item.itemDefinitionId,
    );
    addChange(
      changes,
      values,
      'owner_character_id',
      previous.item.parentItemId ? null : previous.ownerCharacterId,
      item.parentItemId ? null : ownerCharacterId,
    );
    addChange(
      changes,
      values,
      'owner_location_id',
      previous.item.parentItemId ? null : previous.ownerLocationId,
      item.parentItemId ? null : ownerLocationId,
    );
    addChange(changes, values, 'sort_order', previous.sortOrder, sortOrder);
    if (changes.length > 0) {
      await client.query(`UPDATE item_instances SET ${changes.join(', ')} WHERE id = $1`, values);
    }
  }
  if (relationshipsChanged) {
    for (const { item, sortOrder } of afterEntries) {
      if (item.parentItemId && item.relationshipType) {
        await insertItemRelationship(client, after.id, item, sortOrder);
      }
    }
  }
}

function itemEntries(story: Story) {
  return [
    ...(story.characters ?? []).flatMap((character) =>
      (character.items ?? []).map((item, sortOrder) => ({
        ownerCharacterId: character.id as string | null,
        ownerLocationId: null as string | null,
        item,
        sortOrder,
      })),
    ),
    ...(story.locations ?? []).flatMap((location) =>
      (location.items ?? []).map((item, sortOrder) => ({
        ownerCharacterId: null as string | null,
        ownerLocationId: location.id as string | null,
        item,
        sortOrder,
      })),
    ),
  ];
}

function itemRelationshipSignature(entries: ReturnType<typeof itemEntries>) {
  return JSON.stringify(
    entries.map(({ item: { id, parentItemId, relationshipType, slotKey } }) => ({
      id,
      parentItemId,
      relationshipType,
      slotKey,
    })),
  );
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
