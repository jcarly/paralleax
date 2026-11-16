import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  getStoryItemEntries,
  isStoryGraphPositionDelta,
  type Character,
  type GraphDecoration,
  type Group,
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
  await clearStoryGraph(client, story.id);
  await insertStoryLocations(client, story);
  await insertStoryStatDefinitions(client, story);
  await insertStoryItemDefinitions(client, story);
  await insertStoryCharacters(client, story);
  await insertAuthoredItems(client, story);
  await insertStoryDecorations(client, story);
  await insertStatAssignments(client, story);
  await insertInteractionGraph(client, story);
  await insertStoryGroups(client, story);
}

async function clearStoryGraph(client: Queryable, storyId: string) {
  await client.query('DELETE FROM story_groups WHERE story_id = $1', [storyId]);
  await client.query('DELETE FROM graph_decorations WHERE story_id = $1', [storyId]);
  await client.query('DELETE FROM interactions WHERE story_id = $1', [storyId]);
  await client.query('DELETE FROM characters WHERE story_id = $1', [storyId]);
  await client.query('DELETE FROM item_definitions WHERE story_id = $1', [storyId]);
  await client.query('DELETE FROM stat_definitions WHERE story_id = $1', [storyId]);
  await client.query('DELETE FROM locations WHERE story_id = $1', [storyId]);
}

async function insertStoryLocations(client: Queryable, story: Story) {
  for (const [index, location] of (story.locations ?? []).entries()) {
    await insertLocation(client, story.id, location, index);
  }
}

async function insertStoryStatDefinitions(client: Queryable, story: Story) {
  for (const [index, definition] of (story.statDefinitions ?? []).entries()) {
    await insertStatDefinition(client, story.id, definition, index);
  }
}

async function insertStoryItemDefinitions(client: Queryable, story: Story) {
  for (const [index, definition] of (story.itemDefinitions ?? []).entries()) {
    await insertItemDefinition(client, story.id, definition, index);
  }
}

async function insertStoryCharacters(client: Queryable, story: Story) {
  for (const [index, character] of (story.characters ?? []).entries()) {
    await insertCharacter(client, story.id, character, index);
  }
}

async function insertAuthoredItems(client: Queryable, story: Story) {
  const authoredItems = itemEntries(story);
  for (const entry of authoredItems) {
    await insertItemInstance(client, story.id, entry);
  }
  for (const { item, sortOrder } of authoredItems) {
    if (item.parentItemId && item.relationshipType) {
      await insertItemRelationship(client, story.id, item, sortOrder);
    }
  }
}

async function insertStoryDecorations(client: Queryable, story: Story) {
  for (const [index, decoration] of (story.graphDecorations ?? []).entries()) {
    await insertGraphDecoration(client, story.id, decoration, index);
  }
}

async function insertStoryGroups(client: Queryable, story: Story) {
  for (const [index, group] of (story.groups ?? []).entries()) {
    await insertGroup(client, story.id, group, index);
  }
}

async function insertInteractionGraph(client: Queryable, story: Story) {
  await insertInteractionRows(client, story);
  await insertInteractionCharacterRows(client, story);
  await insertInteractionStatEffectRows(client, story);
  await insertInteractionItemEffectRows(client, story);
  const triggers = story.interactions.flatMap((interaction) =>
    interaction.triggers.map((trigger, sortOrder) => ({ interaction, trigger, sortOrder })),
  );
  await insertTriggerRows(client, story, triggers);
  await insertTriggerInputRows(client, story, triggers);
}

async function insertInteractionRows(client: Queryable, story: Story) {
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
}

async function insertInteractionCharacterRows(client: Queryable, story: Story) {
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
}

async function insertInteractionStatEffectRows(client: Queryable, story: Story) {
  await insertJsonRows(
    client,
    `INSERT INTO interaction_stat_effects
     (story_id, interaction_id, stat_id, item_id, operation, value, expression, sort_order)
     SELECT story_id, interaction_id, stat_id, item_id, operation, value, expression, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, stat_id text, item_id text, operation text,
       value jsonb, expression text, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.statEffects ?? []).map((effect, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        stat_id: effect.statId,
        item_id: effect.itemId ?? null,
        operation: effect.operation,
        value: effect.value ?? null,
        expression: effect.expression ?? null,
        sort_order: sortOrder,
      })),
    ),
  );
}

async function insertInteractionItemEffectRows(client: Queryable, story: Story) {
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
}

type TriggerInsertRow = { interaction: Interaction; trigger: Trigger; sortOrder: number };

async function insertTriggerRows(client: Queryable, story: Story, triggers: TriggerInsertRow[]) {
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
}

async function insertTriggerInputRows(
  client: Queryable,
  story: Story,
  triggers: TriggerInsertRow[],
) {
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
  if (rows.length === 0) {
    return;
  }
  await client.query(sql, [JSON.stringify(rows)]);
}

export async function persistStoryDifference(
  client: Queryable,
  before: Story,
  after: Story,
  delta?: StoryChangeDelta,
) {
  await persistStoryFields(client, before, after);
  await persistGraphPositionDifference(client, before, after);
  if (delta && isStoryGraphPositionDelta(delta)) {
    return;
  }

  await persistEntityDifferences(client, before, after);
  const statAssignmentsChanged = await persistStatAssignmentDifference(client, before, after);
  await persistInteractionDifferences(client, before, after, statAssignmentsChanged);
  if (statAssignmentsChanged) {
    await insertInteractionStatEffects(client, after);
  }
  await persistGroupDifference(client, before, after);
}

async function persistStoryFields(client: Queryable, before: Story, after: Story) {
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
}

async function persistEntityDifferences(client: Queryable, before: Story, after: Story) {
  await persistLocationDifference(client, before, after);
  await persistStatDefinitionDifference(client, before, after);
  await persistItemDefinitionDifference(client, before, after);
  await persistCharacterDifference(client, before, after);
  await persistGraphDecorationDifference(client, before, after);
}

async function persistStatAssignmentDifference(client: Queryable, before: Story, after: Story) {
  const statAssignmentsChanged =
    JSON.stringify(storyStatAssignmentState(before)) !==
    JSON.stringify(storyStatAssignmentState(after));
  if (statAssignmentsChanged) {
    await client.query('DELETE FROM interaction_stat_effects WHERE story_id = $1', [after.id]);
    await client.query('DELETE FROM stat_assignments WHERE story_id = $1', [after.id]);
    await insertStatAssignments(client, after);
  }
  return statAssignmentsChanged;
}

async function persistInteractionDifferences(
  client: Queryable,
  before: Story,
  after: Story,
  statAssignmentsChanged: boolean,
) {
  const beforeInteractions = new Map(before.interactions.map((item) => [item.id, item]));
  const beforeInteractionIndexes = new Map(before.interactions.map(({ id }, index) => [id, index]));
  const afterInteractions = new Map(after.interactions.map((item) => [item.id, item]));
  await deleteRemovedInteractions(client, before.interactions, after.id, afterInteractions);
  for (const [index, interaction] of after.interactions.entries()) {
    await persistInteractionRow({
      client,
      afterStoryId: after.id,
      interaction,
      index,
      previous: beforeInteractions.get(interaction.id),
      previousIndex: beforeInteractionIndexes.get(interaction.id) ?? -1,
      statAssignmentsChanged,
    });
  }
}

async function deleteRemovedInteractions(
  client: Queryable,
  before: Interaction[],
  afterStoryId: string,
  afterInteractions: Map<string, Interaction>,
) {
  for (const interaction of before) {
    if (!afterInteractions.has(interaction.id)) {
      await client.query('DELETE FROM interactions WHERE id = $1 AND story_id = $2', [
        interaction.id,
        afterStoryId,
      ]);
    }
  }
}

type PersistInteractionRowInput = {
  client: Queryable;
  afterStoryId: string;
  interaction: Interaction;
  index: number;
  previous: Interaction | undefined;
  previousIndex: number;
  statAssignmentsChanged: boolean;
};

async function persistInteractionRow(input: PersistInteractionRowInput) {
  if (!input.previous) {
    await insertNewInteraction(input);
    return;
  }
  const previous = input.previous;
  await updateInteractionDifference({
    client: input.client,
    before: previous,
    after: input.interaction,
    beforeSortOrder: input.previousIndex,
    sortOrder: input.index,
  });
  await persistInteractionRelations({ ...input, previous });
  await persistTriggerDifference(input.client, input.afterStoryId, previous, input.interaction);
}

async function insertNewInteraction(input: PersistInteractionRowInput) {
  const { client, afterStoryId, interaction, index, statAssignmentsChanged } = input;
  await insertInteraction(client, afterStoryId, interaction, index);
  await replaceInteractionCharacters(client, afterStoryId, interaction);
  if (!statAssignmentsChanged) {
    await replaceInteractionStatEffects(client, afterStoryId, interaction);
  }
  await replaceInteractionItemEffects(client, afterStoryId, interaction);
  for (const [triggerIndex, trigger] of interaction.triggers.entries()) {
    await insertTrigger(client, afterStoryId, interaction.id, trigger, triggerIndex);
  }
}

async function persistInteractionRelations(
  input: Omit<PersistInteractionRowInput, 'previous'> & { previous: Interaction },
) {
  const { client, afterStoryId, previous, interaction, statAssignmentsChanged } = input;
  if (interactionCharactersChanged(previous, interaction)) {
    await replaceInteractionCharacters(client, afterStoryId, interaction);
  }
  if (!statAssignmentsChanged && interactionStatEffectsChanged(previous, interaction)) {
    await replaceInteractionStatEffects(client, afterStoryId, interaction);
  }
  if (interactionItemEffectsChanged(previous, interaction)) {
    await replaceInteractionItemEffects(client, afterStoryId, interaction);
  }
}

function interactionCharactersChanged(previous: Interaction, current: Interaction) {
  return JSON.stringify(previous.characterIds ?? []) !== JSON.stringify(current.characterIds ?? []);
}

function interactionStatEffectsChanged(previous: Interaction, current: Interaction) {
  return JSON.stringify(previous.statEffects ?? []) !== JSON.stringify(current.statEffects ?? []);
}

function interactionItemEffectsChanged(previous: Interaction, current: Interaction) {
  return JSON.stringify(previous.itemEffects ?? []) !== JSON.stringify(current.itemEffects ?? []);
}

async function insertGroup(client: Queryable, storyId: string, group: Group, sortOrder: number) {
  await client.query(
    `INSERT INTO story_groups (id, story_id, title, sort_order, parent_group_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [group.id, storyId, group.title, sortOrder, group.parentGroupId ?? null],
  );
  await replaceGroupInteractions(client, storyId, group);
}

async function replaceGroupInteractions(client: Queryable, storyId: string, group: Group) {
  await client.query('DELETE FROM story_group_interactions WHERE group_id = $1 AND story_id = $2', [
    group.id,
    storyId,
  ]);
  await insertJsonRows(
    client,
    `INSERT INTO story_group_interactions (story_id, group_id, interaction_id, sort_order)
     SELECT story_id, group_id, interaction_id, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, group_id text, interaction_id text, sort_order integer
     )`,
    group.interactionIds.map((interactionId, sortOrder) => ({
      story_id: storyId,
      group_id: group.id,
      interaction_id: interactionId,
      sort_order: sortOrder,
    })),
  );
}

async function persistGroupDifference(client: Queryable, before: Story, after: Story) {
  const beforeGroups = new Map((before.groups ?? []).map((group) => [group.id, group]));
  const afterGroups = new Map((after.groups ?? []).map((group) => [group.id, group]));
  await deleteRemovedGroups(client, before.groups ?? [], after.id, afterGroups);
  for (const [sortOrder, group] of (after.groups ?? []).entries()) {
    await persistGroupRow({
      client,
      storyId: after.id,
      group,
      sortOrder,
      previous: beforeGroups.get(group.id),
      beforeGroups: before.groups ?? [],
    });
  }
}

async function deleteRemovedGroups(
  client: Queryable,
  beforeGroups: Group[],
  storyId: string,
  afterGroups: Map<string, Group>,
) {
  for (const group of beforeGroups) {
    if (!afterGroups.has(group.id)) {
      await client.query('DELETE FROM story_groups WHERE id = $1 AND story_id = $2', [
        group.id,
        storyId,
      ]);
    }
  }
}

async function persistGroupRow({
  client,
  storyId,
  group,
  sortOrder,
  previous,
  beforeGroups,
}: {
  client: Queryable;
  storyId: string;
  group: Group;
  sortOrder: number;
  previous: Group | undefined;
  beforeGroups: Group[];
}) {
  if (!previous) {
    await insertGroup(client, storyId, group, sortOrder);
    return;
  }

  if (
    previous.title !== group.title ||
    previous.parentGroupId !== group.parentGroupId ||
    beforeGroups.indexOf(previous) !== sortOrder
  ) {
    await client.query(
      'UPDATE story_groups SET title = $1, sort_order = $2, parent_group_id = $5 WHERE id = $3 AND story_id = $4',
      [group.title, sortOrder, group.id, storyId, group.parentGroupId ?? null],
    );
  }
  if (JSON.stringify(previous.interactionIds) !== JSON.stringify(group.interactionIds)) {
    await replaceGroupInteractions(client, storyId, group);
  }
}

async function persistGraphPositionDifference(client: Queryable, before: Story, after: Story) {
  const { interactionRows, triggerRows } = collectGraphPositionRows(before, after);
  await updateInteractionPositions(client, after.id, interactionRows);
  await updateTriggerPositions(client, after.id, triggerRows);
}

function collectGraphPositionRows(before: Story, after: Story) {
  const beforeInteractions = new Map(
    before.interactions.map((interaction) => [interaction.id, interaction]),
  );
  const interactionRows: object[] = [];
  const triggerRows: object[] = [];

  for (const interaction of after.interactions) {
    const previous = beforeInteractions.get(interaction.id);
    if (!previous) {
      continue;
    }
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
    triggerRows.push(...collectTriggerPositionRows(previous, interaction));
  }
  return { interactionRows, triggerRows };
}

function collectTriggerPositionRows(previous: Interaction, interaction: Interaction) {
  const beforeTriggers = new Map(previous.triggers.map((trigger) => [trigger.id, trigger]));
  const rows: object[] = [];
  for (const trigger of interaction.triggers) {
    const previousTrigger = beforeTriggers.get(trigger.id);
    if (triggerPositionChanged(previousTrigger, trigger)) {
      rows.push({
        id: trigger.id,
        position_x: trigger.position?.x ?? null,
        position_y: trigger.position?.y ?? null,
      });
    }
  }
  return rows;
}

function triggerPositionChanged(previous: Trigger | undefined, current: Trigger) {
  return (
    previous !== undefined &&
    (previous.position?.x !== current.position?.x || previous.position?.y !== current.position?.y)
  );
}

async function updateInteractionPositions(client: Queryable, storyId: string, rows: object[]) {
  if (rows.length > 0) {
    await client.query(
      `UPDATE interactions AS target
       SET position_x = row.position_x, position_y = row.position_y
       FROM jsonb_to_recordset($1::jsonb) AS row(
         id text, position_x double precision, position_y double precision
       )
       WHERE target.id = row.id AND target.story_id = $2`,
      [JSON.stringify(rows), storyId],
    );
  }
}

async function updateTriggerPositions(client: Queryable, storyId: string, rows: object[]) {
  if (rows.length > 0) {
    await client.query(
      `UPDATE triggers AS target
       SET position_x = row.position_x, position_y = row.position_y
       FROM jsonb_to_recordset($1::jsonb) AS row(
         id text, position_x double precision, position_y double precision
       )
       WHERE target.id = row.id AND target.story_id = $2`,
      [JSON.stringify(rows), storyId],
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
  const assignments = collectStatAssignmentEntries(story);
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

function collectStatAssignmentEntries(story: Story) {
  return [
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
}

async function insertInteractionStatEffects(client: Queryable, story: Story) {
  await insertJsonRows(
    client,
    `INSERT INTO interaction_stat_effects
     (story_id, interaction_id, stat_id, item_id, operation, value, expression, sort_order)
     SELECT story_id, interaction_id, stat_id, item_id, operation, value, expression, sort_order
     FROM jsonb_to_recordset($1::jsonb) AS row(
       story_id text, interaction_id text, stat_id text, item_id text,
       operation text, value jsonb, expression text, sort_order integer
     )`,
    story.interactions.flatMap((interaction) =>
      (interaction.statEffects ?? []).map((effect, sortOrder) => ({
        story_id: story.id,
        interaction_id: interaction.id,
        stat_id: effect.statId,
        item_id: effect.itemId ?? null,
        operation: effect.operation,
        value: effect.value ?? null,
        expression: effect.expression ?? null,
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
  await deleteRemovedGraphDecorations(
    client,
    before.graphDecorations ?? [],
    after.id,
    afterDecorations,
  );
  for (const [index, decoration] of (after.graphDecorations ?? []).entries()) {
    await persistGraphDecorationRow({
      client,
      storyId: after.id,
      beforeDecorations: before.graphDecorations ?? [],
      previous: beforeDecorations.get(decoration.id),
      decoration,
      sortOrder: index,
    });
  }
}

async function deleteRemovedGraphDecorations(
  client: Queryable,
  beforeDecorations: GraphDecoration[],
  storyId: string,
  afterDecorations: Map<string, GraphDecoration>,
) {
  for (const decoration of beforeDecorations) {
    if (!afterDecorations.has(decoration.id)) {
      await client.query('DELETE FROM graph_decorations WHERE id = $1 AND story_id = $2', [
        decoration.id,
        storyId,
      ]);
    }
  }
}

async function persistGraphDecorationRow(input: {
  client: Queryable;
  storyId: string;
  beforeDecorations: GraphDecoration[];
  previous: GraphDecoration | undefined;
  decoration: GraphDecoration;
  sortOrder: number;
}) {
  const { client, storyId, beforeDecorations, previous, decoration, sortOrder } = input;
  if (!previous) {
    await insertGraphDecoration(client, storyId, decoration, sortOrder);
    return;
  }
  const { changes, values } = graphDecorationChanges(
    previous,
    decoration,
    beforeDecorations.findIndex(({ id }) => id === decoration.id),
    sortOrder,
  );
  if (changes.length > 0) {
    await client.query(`UPDATE graph_decorations SET ${changes.join(', ')} WHERE id = $1`, values);
  }
}

function graphDecorationChanges(
  previous: GraphDecoration,
  decoration: GraphDecoration,
  previousSortOrder: number,
  sortOrder: number,
) {
  const changes: string[] = [];
  const values: unknown[] = [decoration.id];
  addChange(changes, values, 'position_x', previous.position.x, decoration.position.x);
  addChange(changes, values, 'position_y', previous.position.y, decoration.position.y);
  addChange(changes, values, 'color', previous.color, decoration.color);
  addGraphDecorationDimensions(changes, values, previous, decoration);
  addGraphDecorationText(changes, values, previous, decoration);
  addChange(changes, values, 'sort_order', previousSortOrder, sortOrder);
  return { changes, values };
}

function addGraphDecorationDimensions(
  changes: string[],
  values: unknown[],
  previous: GraphDecoration,
  decoration: GraphDecoration,
) {
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
}

function addGraphDecorationText(
  changes: string[],
  values: unknown[],
  previous: GraphDecoration,
  decoration: GraphDecoration,
) {
  addGraphDecorationTextContent(changes, values, previous, decoration);
  addGraphDecorationTextStyle(changes, values, previous, decoration);
}

function addGraphDecorationTextContent(
  changes: string[],
  values: unknown[],
  previous: GraphDecoration,
  decoration: GraphDecoration,
) {
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
}

function addGraphDecorationTextStyle(
  changes: string[],
  values: unknown[],
  previous: GraphDecoration,
  decoration: GraphDecoration,
) {
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
       (story_id, interaction_id, stat_id, item_id, operation, value, expression, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        storyId,
        interaction.id,
        effect.statId,
        effect.itemId ?? null,
        effect.operation,
        effect.value === undefined ? null : JSON.stringify(effect.value),
        effect.expression ?? null,
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
  ...[client, storyId, outputInteractionId, trigger, sortOrder]: [
    client: Queryable,
    storyId: string,
    outputInteractionId: string,
    trigger: Trigger,
    sortOrder: number,
  ]
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

async function updateInteractionDifference({
  client,
  before,
  after,
  beforeSortOrder,
  sortOrder,
}: {
  client: Queryable;
  before: Interaction;
  after: Interaction;
  beforeSortOrder: number;
  sortOrder: number;
}) {
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

type PersistEntityRowsInput<T extends { id: string }> = {
  client: Queryable;
  storyId: string;
  table: string;
  before: T[];
  after: T[];
  insert: (item: T, sortOrder: number) => Promise<void>;
  update: (previous: T, current: T, previousSortOrder: number, sortOrder: number) => Promise<void>;
};

async function persistEntityRows<T extends { id: string }>(input: PersistEntityRowsInput<T>) {
  const beforeById = new Map(input.before.map((item) => [item.id, item]));
  const afterIds = new Set(input.after.map(({ id }) => id));
  const beforeIndexes = new Map(input.before.map(({ id }, index) => [id, index]));
  for (const item of input.before) {
    if (!afterIds.has(item.id)) {
      await input.client.query(`DELETE FROM ${input.table} WHERE id = $1 AND story_id = $2`, [
        item.id,
        input.storyId,
      ]);
    }
  }
  for (const [index, item] of input.after.entries()) {
    const previous = beforeById.get(item.id);
    if (!previous) {
      await input.insert(item, index);
    } else {
      await input.update(previous, item, beforeIndexes.get(item.id) ?? -1, index);
    }
  }
}

async function persistLocationDifference(client: Queryable, before: Story, after: Story) {
  await persistEntityRows({
    client,
    storyId: after.id,
    table: 'locations',
    before: before.locations ?? [],
    after: after.locations ?? [],
    insert: (location, sortOrder) => insertLocation(client, after.id, location, sortOrder),
    update: (previous, current, previousSortOrder, sortOrder) =>
      updateLocationDifference({ client, previous, current, previousSortOrder, sortOrder }),
  });
}

async function updateLocationDifference(input: {
  client: Queryable;
  previous: Location;
  current: Location;
  previousSortOrder: number;
  sortOrder: number;
}) {
  const { client, previous, current, previousSortOrder, sortOrder } = input;
  await updateEntityFields(client, 'locations', current.id, [
    { column: 'name', previous: previous.name, current: current.name },
    { column: 'description', previous: previous.description, current: current.description },
    { column: 'category', previous: previous.category ?? '', current: current.category ?? '' },
    { column: 'image_url', previous: previous.imageUrl ?? '', current: current.imageUrl ?? '' },
    { column: 'sort_order', previous: previousSortOrder, current: sortOrder },
  ]);
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

async function updateEntityRow(
  client: Queryable,
  table: string,
  changes: string[],
  values: unknown[],
) {
  if (changes.length > 0) {
    await client.query(`UPDATE ${table} SET ${changes.join(', ')} WHERE id = $1`, values);
  }
}

async function updateEntityFields(
  client: Queryable,
  table: string,
  id: string,
  fields: Array<{ column: string; previous: unknown; current: unknown }>,
) {
  const changes: string[] = [];
  const values: unknown[] = [id];
  for (const field of fields) {
    addChange(changes, values, field.column, field.previous, field.current);
  }
  await updateEntityRow(client, table, changes, values);
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
  await persistEntityRows({
    client,
    storyId: after.id,
    table: 'stat_definitions',
    before: before.statDefinitions ?? [],
    after: after.statDefinitions ?? [],
    insert: (definition, sortOrder) =>
      insertStatDefinition(client, after.id, definition, sortOrder),
    update: (previous, current, previousSortOrder, sortOrder) =>
      updateStatDefinitionDifference({ client, previous, current, previousSortOrder, sortOrder }),
  });
}

async function updateStatDefinitionDifference(input: {
  client: Queryable;
  previous: StatDefinition;
  current: StatDefinition;
  previousSortOrder: number;
  sortOrder: number;
}) {
  const { client, previous, current, previousSortOrder, sortOrder } = input;
  await updateEntityFields(client, 'stat_definitions', current.id, [
    { column: 'name', previous: previous.name, current: current.name },
    {
      column: 'value_type',
      previous: previous.valueType ?? 'number',
      current: current.valueType ?? 'number',
    },
    { column: 'category', previous: previous.category ?? '', current: current.category ?? '' },
    { column: 'image_url', previous: previous.imageUrl ?? '', current: current.imageUrl ?? '' },
    {
      column: 'change_per_hour',
      previous: previous.changePerHour ?? 0,
      current: current.changePerHour ?? 0,
    },
    { column: 'sort_order', previous: previousSortOrder, current: sortOrder },
  ]);
}

async function persistItemDefinitionDifference(client: Queryable, before: Story, after: Story) {
  await persistEntityRows({
    client,
    storyId: after.id,
    table: 'item_definitions',
    before: before.itemDefinitions ?? [],
    after: after.itemDefinitions ?? [],
    insert: (definition, sortOrder) =>
      insertItemDefinition(client, after.id, definition, sortOrder),
    update: (previous, current, previousSortOrder, sortOrder) =>
      updateItemDefinitionDifference({ client, previous, current, previousSortOrder, sortOrder }),
  });
}

async function updateItemDefinitionDifference(input: {
  client: Queryable;
  previous: ItemDefinition;
  current: ItemDefinition;
  previousSortOrder: number;
  sortOrder: number;
}) {
  const { client, previous, current, previousSortOrder, sortOrder } = input;
  await updateEntityFields(client, 'item_definitions', current.id, [
    { column: 'name', previous: previous.name, current: current.name },
    { column: 'description', previous: previous.description, current: current.description },
    { column: 'category', previous: previous.category ?? '', current: current.category ?? '' },
    { column: 'image_url', previous: previous.imageUrl ?? '', current: current.imageUrl ?? '' },
    { column: 'sort_order', previous: previousSortOrder, current: sortOrder },
  ]);
}

async function persistCharacterDifference(client: Queryable, before: Story, after: Story) {
  const previousPlayableId = (before.characters ?? []).find(({ isPlayable }) => isPlayable)?.id;
  const nextPlayableId = (after.characters ?? []).find(({ isPlayable }) => isPlayable)?.id;
  if (previousPlayableId !== nextPlayableId && previousPlayableId) {
    await client.query('UPDATE characters SET is_playable = false WHERE story_id = $1', [after.id]);
  }
  await persistEntityRows({
    client,
    storyId: after.id,
    table: 'characters',
    before: before.characters ?? [],
    after: after.characters ?? [],
    insert: (character, sortOrder) => insertCharacter(client, after.id, character, sortOrder),
    update: (previous, current, previousSortOrder, sortOrder) =>
      updateCharacterDifference({ client, previous, current, previousSortOrder, sortOrder }),
  });
  await persistItemInstanceDifference(client, before, after);
}

async function updateCharacterDifference(input: {
  client: Queryable;
  previous: Character;
  current: Character;
  previousSortOrder: number;
  sortOrder: number;
}) {
  const { client, previous, current, previousSortOrder, sortOrder } = input;
  await updateEntityFields(client, 'characters', current.id, [
    { column: 'name', previous: previous.name, current: current.name },
    { column: 'description', previous: previous.description, current: current.description },
    { column: 'category', previous: previous.category ?? '', current: current.category ?? '' },
    { column: 'image_url', previous: previous.imageUrl ?? '', current: current.imageUrl ?? '' },
    {
      column: 'is_playable',
      previous: previous.isPlayable ?? false,
      current: current.isPlayable ?? false,
    },
    { column: 'sort_order', previous: previousSortOrder, current: sortOrder },
  ]);
}

async function persistItemInstanceDifference(client: Queryable, before: Story, after: Story) {
  const beforeEntries = itemEntries(before);
  const afterEntries = itemEntries(after);
  const beforeItems = new Map(beforeEntries.map((entry) => [entry.item.id, entry]));
  const afterItems = new Map(afterEntries.map((entry) => [entry.item.id, entry]));
  const relationshipsChanged =
    itemRelationshipSignature(beforeEntries) !== itemRelationshipSignature(afterEntries);
  await removeOldItemRelationships({
    client,
    storyId: after.id,
    beforeItems,
    afterItems,
    relationshipsChanged,
  });
  await deleteRemovedItemInstances(client, after.id, beforeEntries, afterItems);
  await persistItemInstanceRows({ client, storyId: after.id, afterEntries, beforeItems });
  if (relationshipsChanged) {
    await insertItemRelationships(client, after.id, afterEntries);
  }
}

async function removeOldItemRelationships({
  client,
  storyId,
  beforeItems,
  afterItems,
  relationshipsChanged,
}: {
  client: Queryable;
  storyId: string;
  beforeItems: Map<string, ReturnType<typeof itemEntries>[number]>;
  afterItems: Map<string, ReturnType<typeof itemEntries>[number]>;
  relationshipsChanged: boolean;
}) {
  if (relationshipsChanged) {
    const childIds = new Set([...beforeItems.keys(), ...afterItems.keys()]);
    for (const childId of childIds) {
      await client.query(
        'DELETE FROM item_instance_relationships WHERE story_id = $1 AND child_item_id = $2',
        [storyId, childId],
      );
    }
  }
}

async function deleteRemovedItemInstances(
  client: Queryable,
  storyId: string,
  beforeEntries: ReturnType<typeof itemEntries>,
  afterItems: Map<string, ReturnType<typeof itemEntries>[number]>,
) {
  for (const { item } of beforeEntries) {
    if (!afterItems.has(item.id)) {
      await client.query('DELETE FROM item_instances WHERE id = $1 AND story_id = $2', [
        item.id,
        storyId,
      ]);
    }
  }
}

async function persistItemInstanceRows({
  client,
  storyId,
  afterEntries,
  beforeItems,
}: {
  client: Queryable;
  storyId: string;
  afterEntries: ReturnType<typeof itemEntries>;
  beforeItems: Map<string, ReturnType<typeof itemEntries>[number]>;
}) {
  for (const entry of afterEntries) {
    const previous = beforeItems.get(entry.item.id);
    if (!previous) {
      await insertItemInstance(client, storyId, entry);
      continue;
    }
    await updateItemInstance(client, previous, entry);
  }
}

async function updateItemInstance(
  client: Queryable,
  previous: ReturnType<typeof itemEntries>[number],
  current: ReturnType<typeof itemEntries>[number],
) {
  const changes: string[] = [];
  const values: unknown[] = [current.item.id];
  addChange(
    changes,
    values,
    'item_definition_id',
    previous.item.itemDefinitionId,
    current.item.itemDefinitionId,
  );
  addChange(
    changes,
    values,
    'owner_character_id',
    previous.item.parentItemId ? null : previous.ownerCharacterId,
    current.item.parentItemId ? null : current.ownerCharacterId,
  );
  addChange(
    changes,
    values,
    'owner_location_id',
    previous.item.parentItemId ? null : previous.ownerLocationId,
    current.item.parentItemId ? null : current.ownerLocationId,
  );
  addChange(changes, values, 'sort_order', previous.sortOrder, current.sortOrder);
  await updateEntityRow(client, 'item_instances', changes, values);
}

async function insertItemRelationships(
  client: Queryable,
  storyId: string,
  entries: ReturnType<typeof itemEntries>,
) {
  for (const { item, sortOrder } of entries) {
    if (item.parentItemId && item.relationshipType) {
      await insertItemRelationship(client, storyId, item, sortOrder);
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
  await deleteRemovedTriggers(client, beforeInteraction.triggers, afterTriggers);
  for (const [index, trigger] of afterInteraction.triggers.entries()) {
    await persistTriggerRow({
      client,
      storyId,
      beforeInteraction,
      trigger,
      sortOrder: index,
      previous: beforeTriggers.get(trigger.id),
    });
  }
}

async function deleteRemovedTriggers(
  client: Queryable,
  beforeTriggers: Trigger[],
  afterTriggers: Map<string, Trigger>,
) {
  for (const trigger of beforeTriggers) {
    if (!afterTriggers.has(trigger.id)) {
      await client.query('DELETE FROM triggers WHERE id = $1', [trigger.id]);
    }
  }
}

async function persistTriggerRow({
  client,
  storyId,
  beforeInteraction,
  trigger,
  sortOrder,
  previous,
}: {
  client: Queryable;
  storyId: string;
  beforeInteraction: Interaction;
  trigger: Trigger;
  sortOrder: number;
  previous: Trigger | undefined;
}) {
  if (!previous) {
    await insertTrigger(client, storyId, beforeInteraction.id, trigger, sortOrder);
    return;
  }
  const previousSortOrder = beforeInteraction.triggers.findIndex(({ id }) => id === trigger.id);
  if (previousSortOrder !== sortOrder) {
    await client.query('UPDATE triggers SET sort_order = $2 WHERE id = $1', [
      trigger.id,
      sortOrder,
    ]);
  }
  await persistTriggerFields(client, storyId, previous, trigger);
}

async function persistTriggerFields(
  client: Queryable,
  storyId: string,
  previous: Trigger,
  trigger: Trigger,
) {
  if (triggerRulesChanged(previous, trigger)) {
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
  if (triggerInputsChanged(previous, trigger)) {
    await replaceTriggerInputs(client, storyId, trigger);
  }
}

function triggerRulesChanged(previous: Trigger, current: Trigger) {
  return (
    JSON.stringify(getTriggerConditionGroups(previous)) !==
      JSON.stringify(getTriggerConditionGroups(current)) ||
    getTriggerAppearanceProbability(previous) !== getTriggerAppearanceProbability(current) ||
    getTriggerTimerSeconds(previous) !== getTriggerTimerSeconds(current)
  );
}

function triggerInputsChanged(previous: Trigger, current: Trigger) {
  return (
    JSON.stringify(previous.inputInteractionIds) !== JSON.stringify(current.inputInteractionIds)
  );
}

function addChange(
  ...[changes, values, column, before, after]: [
    changes: string[],
    values: unknown[],
    column: string,
    before: unknown,
    after: unknown,
  ]
) {
  if (before === after) {
    return;
  }
  values.push(after);
  changes.push(`${column} = $${values.length}`);
}
