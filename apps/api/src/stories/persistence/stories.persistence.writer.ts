import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  getStoryItemEntries,
  isStoryGraphPositionDelta,
  type Character,
  type GraphDecoration,
  type Interaction,
  type ItemDefinition,
  type Location,
  type StatDefinition,
  type Story,
  type StoryChangeDelta,
  type Trigger,
} from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';

export async function replaceStoryGraph(client: Queryable, story: Story) {
  await client.query('DELETE FROM graph_decorations WHERE story_id = $1', [story.id]);
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
  for (const [index, decoration] of (story.graphDecorations ?? []).entries()) {
    await insertGraphDecoration(client, story.id, decoration, index);
  }
  await insertStatAssignments(client, story);
  await insertInteractionGraph(client, story);
}

async function insertInteractionGraph(client: Queryable, story: Story) {
  await insertJsonRows(
    client,
    `INSERT INTO interactions
     (id, story_id, title, body, position_x, position_y, location_id, duration_minutes,
      conditional_text_blocks, sort_order)
     SELECT id, story_id, title, body, position_x, position_y, location_id, duration_minutes,
            conditional_text_blocks, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       id text, story_id text, title text, body text, position_x double precision,
       position_y double precision, location_id text, duration_minutes integer,
       conditional_text_blocks jsonb, sort_order integer
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
      conditional_text_blocks: interaction.conditionalTextBlocks ?? [],
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
     (story_id, interaction_id, stat_id, item_id, operation, value, sort_order)
     SELECT story_id, interaction_id, stat_id, item_id, operation, value, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, stat_id text, item_id text, operation text,
       value jsonb, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.statEffects ?? []).map((effect, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        stat_id: effect.statId,
        item_id: effect.itemId ?? null,
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
    `INSERT INTO triggers
     (id, story_id, output_interaction_id, position_x, position_y, condition_groups,
      appearance_probability, timer_seconds, sort_order)
     SELECT id, story_id, output_interaction_id, position_x, position_y, condition_groups,
       appearance_probability, timer_seconds, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       id text, story_id text, output_interaction_id text, position_x double precision,
       position_y double precision, condition_groups jsonb, appearance_probability smallint,
       timer_seconds integer, sort_order integer
     )`,
    triggers.map(({ interaction, trigger, sortOrder }) => ({
      id: trigger.id,
      story_id: story.id,
      output_interaction_id: interaction.id,
      position_x: trigger.position?.x ?? null,
      position_y: trigger.position?.y ?? null,
      condition_groups: getTriggerConditionGroups(trigger),
      appearance_probability: getTriggerAppearanceProbability(trigger),
      timer_seconds: getTriggerTimerSeconds(trigger),
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

export async function persistStoryDifference(
  client: Queryable,
  before: Story,
  after: Story,
  delta?: StoryChangeDelta,
) {
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

  await persistGraphPositionDifference(client, before, after);
  if (delta && isStoryGraphPositionDelta(delta)) return;

  await persistLocationDifference(client, before, after);
  await persistStatDefinitionDifference(client, before, after);
  await persistItemDefinitionDifference(client, before, after);
  await persistCharacterDifference(client, before, after);
  await persistGraphDecorationDifference(client, before, after);

  const statAssignmentsChanged =
    JSON.stringify(storyStatAssignmentState(before)) !==
    JSON.stringify(storyStatAssignmentState(after));
  if (statAssignmentsChanged) {
    await client.query('DELETE FROM interaction_stat_effects WHERE story_id = $1', [after.id]);
    await client.query('DELETE FROM stat_assignments WHERE story_id = $1', [after.id]);
    await insertStatAssignments(client, after);
  }

  const beforeInteractions = new Map(before.interactions.map((item) => [item.id, item]));
  const beforeInteractionIndexes = new Map(before.interactions.map(({ id }, index) => [id, index]));
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
      if (!statAssignmentsChanged) {
        await replaceInteractionStatEffects(client, after.id, interaction);
      }
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
      beforeInteractionIndexes.get(interaction.id) ?? -1,
      index,
    );
    if (
      JSON.stringify(previous.characterIds ?? []) !== JSON.stringify(interaction.characterIds ?? [])
    ) {
      await replaceInteractionCharacters(client, after.id, interaction);
    }
    if (
      !statAssignmentsChanged &&
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
  if (statAssignmentsChanged) {
    await insertInteractionStatEffects(client, after);
  }
}

async function persistGraphPositionDifference(client: Queryable, before: Story, after: Story) {
  const beforeInteractions = new Map(
    before.interactions.map((interaction) => [interaction.id, interaction]),
  );
  const interactionRows: object[] = [];
  const triggerRows: object[] = [];

  for (const interaction of after.interactions) {
    const previous = beforeInteractions.get(interaction.id);
    if (!previous) continue;
    if (
      previous.position.x !== interaction.position.x ||
      previous.position.y !== interaction.position.y
    ) {
      interactionRows.push({
        id: interaction.id,
        position_x: interaction.position.x,
        position_y: interaction.position.y,
      });
    }

    const beforeTriggers = new Map(previous.triggers.map((trigger) => [trigger.id, trigger]));
    for (const trigger of interaction.triggers) {
      const previousTrigger = beforeTriggers.get(trigger.id);
      if (
        previousTrigger &&
        (previousTrigger.position?.x !== trigger.position?.x ||
          previousTrigger.position?.y !== trigger.position?.y)
      ) {
        triggerRows.push({
          id: trigger.id,
          position_x: trigger.position?.x ?? null,
          position_y: trigger.position?.y ?? null,
        });
      }
    }
  }

  if (interactionRows.length > 0) {
    await client.query(
      `UPDATE interactions AS target
       SET position_x = row.position_x, position_y = row.position_y
       FROM jsonb_to_recordset($1::jsonb) AS row(
         id text, position_x double precision, position_y double precision
       )
       WHERE target.id = row.id AND target.story_id = $2`,
      [JSON.stringify(interactionRows), after.id],
    );
  }
  if (triggerRows.length > 0) {
    await client.query(
      `UPDATE triggers AS target
       SET position_x = row.position_x, position_y = row.position_y
       FROM jsonb_to_recordset($1::jsonb) AS row(
         id text, position_x double precision, position_y double precision
       )
       WHERE target.id = row.id AND target.story_id = $2`,
      [JSON.stringify(triggerRows), after.id],
    );
  }
}

function storyStatAssignmentState(story: Story) {
  return [
    { ownerType: 'story', stats: story.stats ?? [] },
    ...(story.characters ?? []).map((character) => ({
      ownerType: 'character',
      ownerId: character.id,
      stats: character.stats ?? [],
    })),
    ...(story.locations ?? []).map((location) => ({
      ownerType: 'location',
      ownerId: location.id,
      stats: location.stats ?? [],
    })),
    ...(story.itemDefinitions ?? []).map((definition) => ({
      ownerType: 'item_definition',
      ownerId: definition.id,
      stats: definition.stats ?? [],
    })),
  ];
}

async function insertStatAssignments(client: Queryable, story: Story) {
  const assignments = [
    ...(story.stats ?? []).map((stat, sortOrder) => ({
      stat,
      ownerType: 'story',
      characterId: null,
      locationId: null,
      itemDefinitionId: null,
      sortOrder,
    })),
    ...(story.characters ?? []).flatMap((character) =>
      (character.stats ?? []).map((stat, sortOrder) => ({
        stat,
        ownerType: 'character',
        characterId: character.id,
        locationId: null,
        itemDefinitionId: null,
        sortOrder,
      })),
    ),
    ...(story.locations ?? []).flatMap((location) =>
      (location.stats ?? []).map((stat, sortOrder) => ({
        stat,
        ownerType: 'location',
        characterId: null,
        locationId: location.id,
        itemDefinitionId: null,
        sortOrder,
      })),
    ),
    ...(story.itemDefinitions ?? []).flatMap((definition) =>
      (definition.stats ?? []).map((stat, sortOrder) => ({
        stat,
        ownerType: 'item_definition',
        characterId: null,
        locationId: null,
        itemDefinitionId: definition.id,
        sortOrder,
      })),
    ),
  ];

  await insertJsonRows(
    client,
    `INSERT INTO stat_assignments
     (id, story_id, stat_definition_id, owner_type, character_id, location_id,
      item_definition_id, initial_value, sort_order)
     SELECT id, story_id, stat_definition_id, owner_type, character_id, location_id,
            item_definition_id, initial_value, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       id text, story_id text, stat_definition_id text, owner_type text,
       character_id text, location_id text, item_definition_id text,
       initial_value jsonb, sort_order integer
     )`,
    assignments.map(
      ({ stat, ownerType, characterId, locationId, itemDefinitionId, sortOrder }) => ({
        id: stat.id,
        story_id: story.id,
        stat_definition_id: stat.statDefinitionId,
        owner_type: ownerType,
        character_id: characterId,
        location_id: locationId,
        item_definition_id: itemDefinitionId,
        initial_value: stat.initialValue,
        sort_order: sortOrder,
      }),
    ),
  );
}

async function insertInteractionStatEffects(client: Queryable, story: Story) {
  await insertJsonRows(
    client,
    `INSERT INTO interaction_stat_effects
     (story_id, interaction_id, stat_id, item_id, operation, value, sort_order)
     SELECT story_id, interaction_id, stat_id, item_id, operation, value, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, stat_id text, item_id text,
       operation text, value jsonb, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.statEffects ?? []).map((effect, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        stat_id: effect.statId,
        item_id: effect.itemId ?? null,
        operation: effect.operation,
        value: effect.value,
        sort_order: sortOrder,
      })),
    ),
  );
}

async function insertGraphDecoration(
  client: Queryable,
  storyId: string,
  decoration: GraphDecoration,
  sortOrder: number,
) {
  await client.query(
    `INSERT INTO graph_decorations
     (id, story_id, kind, position_x, position_y, width, height, text_content, color,
      font_size, font_family, font_weight, font_style, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      decoration.id,
      storyId,
      decoration.kind,
      decoration.position.x,
      decoration.position.y,
      decoration.kind === 'frame' ? decoration.width : null,
      decoration.kind === 'frame' ? decoration.height : null,
      decoration.kind === 'text' ? decoration.text : null,
      decoration.color,
      decoration.kind === 'text' ? decoration.fontSize : null,
      decoration.kind === 'text' ? decoration.fontFamily : null,
      decoration.kind === 'text' ? decoration.fontWeight : null,
      decoration.kind === 'text' ? decoration.fontStyle : null,
      sortOrder,
    ],
  );
}

async function persistGraphDecorationDifference(client: Queryable, before: Story, after: Story) {
  const beforeDecorations = new Map(
    (before.graphDecorations ?? []).map((decoration) => [decoration.id, decoration]),
  );
  const afterDecorations = new Map(
    (after.graphDecorations ?? []).map((decoration) => [decoration.id, decoration]),
  );

  for (const decoration of before.graphDecorations ?? []) {
    if (!afterDecorations.has(decoration.id)) {
      await client.query('DELETE FROM graph_decorations WHERE id = $1 AND story_id = $2', [
        decoration.id,
        after.id,
      ]);
    }
  }

  for (const [index, decoration] of (after.graphDecorations ?? []).entries()) {
    const previous = beforeDecorations.get(decoration.id);
    if (!previous) {
      await insertGraphDecoration(client, after.id, decoration, index);
      continue;
    }

    const changes: string[] = [];
    const values: unknown[] = [decoration.id];
    addChange(changes, values, 'position_x', previous.position.x, decoration.position.x);
    addChange(changes, values, 'position_y', previous.position.y, decoration.position.y);
    addChange(changes, values, 'color', previous.color, decoration.color);
    addChange(
      changes,
      values,
      'width',
      previous.kind === 'frame' ? previous.width : null,
      decoration.kind === 'frame' ? decoration.width : null,
    );
    addChange(
      changes,
      values,
      'height',
      previous.kind === 'frame' ? previous.height : null,
      decoration.kind === 'frame' ? decoration.height : null,
    );
    addChange(
      changes,
      values,
      'text_content',
      previous.kind === 'text' ? previous.text : null,
      decoration.kind === 'text' ? decoration.text : null,
    );
    addChange(
      changes,
      values,
      'font_size',
      previous.kind === 'text' ? previous.fontSize : null,
      decoration.kind === 'text' ? decoration.fontSize : null,
    );
    addChange(
      changes,
      values,
      'font_family',
      previous.kind === 'text' ? previous.fontFamily : null,
      decoration.kind === 'text' ? decoration.fontFamily : null,
    );
    addChange(
      changes,
      values,
      'font_weight',
      previous.kind === 'text' ? previous.fontWeight : null,
      decoration.kind === 'text' ? decoration.fontWeight : null,
    );
    addChange(
      changes,
      values,
      'font_style',
      previous.kind === 'text' ? previous.fontStyle : null,
      decoration.kind === 'text' ? decoration.fontStyle : null,
    );
    addChange(
      changes,
      values,
      'sort_order',
      (before.graphDecorations ?? []).findIndex(({ id }) => id === decoration.id),
      index,
    );
    if (changes.length > 0) {
      await client.query(
        `UPDATE graph_decorations SET ${changes.join(', ')} WHERE id = $1`,
        values,
      );
    }
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
       (story_id, interaction_id, stat_id, item_id, operation, value, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        storyId,
        interaction.id,
        effect.statId,
        effect.itemId ?? null,
        effect.operation,
        JSON.stringify(effect.value),
        index,
      ],
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
      conditional_text_blocks, sort_order)
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
      JSON.stringify(interaction.conditionalTextBlocks ?? []),
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
    `INSERT INTO triggers
     (id, story_id, output_interaction_id, position_x, position_y, condition_groups,
      appearance_probability, timer_seconds, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      trigger.id,
      storyId,
      outputInteractionId,
      trigger.position?.x ?? null,
      trigger.position?.y ?? null,
      JSON.stringify(getTriggerConditionGroups(trigger)),
      getTriggerAppearanceProbability(trigger),
      getTriggerTimerSeconds(trigger),
      sortOrder,
    ],
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
    'conditional_text_blocks',
    JSON.stringify(before.conditionalTextBlocks ?? []),
    JSON.stringify(after.conditionalTextBlocks ?? []),
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
    `INSERT INTO locations (id, story_id, name, description, category, image_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      location.id,
      storyId,
      location.name,
      location.description,
      location.category ?? '',
      location.imageUrl ?? '',
      sortOrder,
    ],
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
    addChange(changes, values, 'category', previous.category ?? '', location.category ?? '');
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
     (id, story_id, name, description, category, image_url, is_playable, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      character.id,
      storyId,
      character.name,
      character.description,
      character.category ?? '',
      character.imageUrl ?? '',
      character.isPlayable ?? false,
      sortOrder,
    ],
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
     (id, story_id, name, value_type, category, image_url, change_per_hour, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      definition.id,
      storyId,
      definition.name,
      definition.valueType ?? 'number',
      definition.category ?? '',
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
    `INSERT INTO item_definitions
     (id, story_id, name, description, category, image_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      definition.id,
      storyId,
      definition.name,
      definition.description,
      definition.category ?? '',
      definition.imageUrl ?? '',
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
    addChange(
      changes,
      values,
      'value_type',
      previous.valueType ?? 'number',
      definition.valueType ?? 'number',
    );
    addChange(changes, values, 'category', previous.category ?? '', definition.category ?? '');
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
    addChange(changes, values, 'category', previous.category ?? '', definition.category ?? '');
    addChange(changes, values, 'image_url', previous.imageUrl ?? '', definition.imageUrl ?? '');
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
      continue;
    }
    const changes: string[] = [];
    const values: unknown[] = [character.id];
    addChange(changes, values, 'name', previous.name, character.name);
    addChange(changes, values, 'description', previous.description, character.description);
    addChange(changes, values, 'category', previous.category ?? '', character.category ?? '');
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
  return getStoryItemEntries(story).map(({ ownerType, ownerId, item, sortOrder }) => ({
    ownerCharacterId: ownerType === 'character' ? ownerId : null,
    ownerLocationId: ownerType === 'location' ? ownerId : null,
    item,
    sortOrder,
  }));
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
    const inputsChanged =
      JSON.stringify(previous.inputInteractionIds) !== JSON.stringify(trigger.inputInteractionIds);
    const rulesChanged =
      JSON.stringify(getTriggerConditionGroups(previous)) !==
        JSON.stringify(getTriggerConditionGroups(trigger)) ||
      getTriggerAppearanceProbability(previous) !== getTriggerAppearanceProbability(trigger) ||
      getTriggerTimerSeconds(previous) !== getTriggerTimerSeconds(trigger);
    if (rulesChanged) {
      await client.query(
        `UPDATE triggers
         SET condition_groups = $2, appearance_probability = $3, timer_seconds = $4
         WHERE id = $1`,
        [
          trigger.id,
          JSON.stringify(getTriggerConditionGroups(trigger)),
          getTriggerAppearanceProbability(trigger),
          getTriggerTimerSeconds(trigger),
        ],
      );
    }
    if (inputsChanged) {
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
