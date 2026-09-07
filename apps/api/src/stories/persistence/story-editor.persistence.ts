import type {
  StoryEditorContextPage,
  StoryEditorInteractionContentPage,
  StoryEditorInteractionPage,
  StoryEditorTriggerContentPage,
  StoryEditorTriggerPage,
  StatValue,
  TriggerConditionGroup,
} from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';

interface ReadPageOptions {
  storyId: string;
  revision: number;
  page: number;
  pageSize: number;
}

type ContextRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  image_url: string;
  sort_order: number;
};

type CharacterRow = ContextRow & { is_playable: boolean };
type StatDefinitionRow = {
  id: string;
  name: string;
  value_type: 'number' | 'boolean' | 'string';
  category: string;
  image_url: string;
  change_per_hour: number;
  sort_order: number;
};
type StatAssignmentRow = {
  id: string;
  stat_definition_id: string;
  owner_type: 'story' | 'character' | 'location' | 'item_definition';
  character_id: string | null;
  location_id: string | null;
  item_definition_id: string | null;
  initial_value: StatValue;
  sort_order: number;
};
type ItemInstanceRow = {
  id: string;
  owner_character_id: string | null;
  owner_location_id: string | null;
  item_definition_id: string;
  parent_item_id: string | null;
  relationship_type:
    'contained' | 'equipped' | 'attached' | 'part_of' | 'installed' | 'worn' | 'held' | null;
  slot_key: string | null;
  sort_order: number;
};
type GraphDecorationRow = {
  id: string;
  kind: 'frame' | 'text';
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
type InteractionSummaryRow = {
  id: string;
  title: string;
  position_x: number;
  position_y: number;
  location_id: string | null;
  sort_order: number;
};
type TriggerStructureRow = {
  id: string;
  output_interaction_id: string;
  position_x: number | null;
  position_y: number | null;
  interaction_sort_order: number;
  sort_order: number;
};
type TriggerInputRow = {
  trigger_id: string;
  input_interaction_id: string;
  sort_order: number;
};
type InteractionContentRow = {
  id: string;
  body: string;
  duration_minutes: number;
  conditional_text_blocks: StoryEditorInteractionContentPage['interactions'][number]['conditionalTextBlocks'];
  sort_order: number;
};
type InteractionCharacterRow = {
  interaction_id: string;
  character_id: string;
  sort_order: number;
};
type StatEffectRow = {
  interaction_id: string;
  stat_id: string;
  item_id: string | null;
  operation: 'add' | 'set';
  value: StatValue;
  sort_order: number;
};
type ItemEffectRow = {
  interaction_id: string;
  item_id: string | null;
  item_definition_id: string | null;
  character_id: string | null;
  operation: 'obtain' | 'lose';
  sort_order: number;
};
type TriggerContentRow = {
  id: string;
  condition_groups: TriggerConditionGroup[];
  appearance_probability: number;
  timer_seconds: number | null;
  interaction_sort_order: number;
  sort_order: number;
};

export async function readStoryEditorContextPage(
  queryable: Queryable,
  options: ReadPageOptions,
  includeGraphDecorations = true,
): Promise<StoryEditorContextPage> {
  const { storyId, revision, page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  const parameters = [storyId, pageSize, offset];
  const [
    locations,
    characters,
    statDefinitions,
    statAssignments,
    itemDefinitions,
    itemInstances,
    graphDecorations,
  ] = await Promise.all([
    queryable.query<ContextRow>(
      `SELECT id, name, description, category, image_url, sort_order
           FROM locations WHERE story_id = $1
           ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
      parameters,
    ),
    queryable.query<CharacterRow>(
      `SELECT id, name, description, category, image_url, is_playable, sort_order
           FROM characters WHERE story_id = $1
           ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
      parameters,
    ),
    queryable.query<StatDefinitionRow>(
      `SELECT id, name, value_type, category, image_url, change_per_hour, sort_order
           FROM stat_definitions WHERE story_id = $1
           ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
      parameters,
    ),
    queryable.query<StatAssignmentRow>(
      `SELECT id, stat_definition_id, owner_type, character_id, location_id,
                item_definition_id, initial_value, sort_order
           FROM stat_assignments WHERE story_id = $1
           ORDER BY owner_type, sort_order, id LIMIT $2 OFFSET $3`,
      parameters,
    ),
    queryable.query<ContextRow>(
      `SELECT id, name, description, category, image_url, sort_order
           FROM item_definitions WHERE story_id = $1
           ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
      parameters,
    ),
    queryable.query<ItemInstanceRow>(
      `SELECT items.id, items.owner_character_id, items.owner_location_id,
                items.item_definition_id, relationship.parent_item_id,
                relationship.relationship_type, relationship.slot_key, items.sort_order
           FROM item_instances AS items
           LEFT JOIN item_instance_relationships AS relationship
             ON relationship.child_item_id = items.id
           WHERE items.story_id = $1
           ORDER BY items.sort_order, items.id LIMIT $2 OFFSET $3`,
      parameters,
    ),
    includeGraphDecorations
      ? queryable.query<GraphDecorationRow>(
          `SELECT id, kind, position_x, position_y, width, height, text_content, color,
                font_size, font_family, font_weight, font_style, sort_order
           FROM graph_decorations WHERE story_id = $1
           ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
          parameters,
        )
      : Promise.resolve({ rows: [] as GraphDecorationRow[] }),
  ]);

  return {
    revision,
    page,
    pageSize,
    hasMore: [
      locations,
      characters,
      statDefinitions,
      statAssignments,
      itemDefinitions,
      itemInstances,
      graphDecorations,
    ].some((result) => result.rows.length === pageSize),
    locations: locations.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      ...(row.category ? { category: row.category } : {}),
      ...(row.image_url ? { imageUrl: row.image_url } : {}),
    })),
    characters: characters.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      ...(row.category ? { category: row.category } : {}),
      ...(row.image_url ? { imageUrl: row.image_url } : {}),
      ...(row.is_playable ? { isPlayable: true } : {}),
    })),
    statDefinitions: statDefinitions.rows.map((row) => ({
      id: row.id,
      name: row.name,
      valueType: row.value_type,
      ...(row.category ? { category: row.category } : {}),
      ...(row.image_url ? { imageUrl: row.image_url } : {}),
      ...(row.change_per_hour ? { changePerHour: row.change_per_hour } : {}),
    })),
    statAssignments: statAssignments.rows.map((row) => ({
      id: row.id,
      statDefinitionId: row.stat_definition_id,
      initialValue: row.initial_value,
      ownerType: row.owner_type === 'item_definition' ? 'itemDefinition' : row.owner_type,
      ...statOwner(row),
    })),
    itemDefinitions: itemDefinitions.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      ...(row.category ? { category: row.category } : {}),
      ...(row.image_url ? { imageUrl: row.image_url } : {}),
    })),
    itemInstances: itemInstances.rows.map((row) => ({
      id: row.id,
      itemDefinitionId: row.item_definition_id,
      ...(row.owner_character_id
        ? { ownerType: 'character' as const, ownerId: row.owner_character_id }
        : row.owner_location_id
          ? { ownerType: 'location' as const, ownerId: row.owner_location_id }
          : {}),
      ...(row.parent_item_id ? { parentItemId: row.parent_item_id } : {}),
      ...(row.relationship_type ? { relationshipType: row.relationship_type } : {}),
      ...(row.slot_key ? { slotKey: row.slot_key } : {}),
    })),
    graphDecorations: graphDecorations.rows.map((row) =>
      row.kind === 'frame'
        ? {
            id: row.id,
            kind: 'frame',
            position: { x: row.position_x, y: row.position_y },
            color: row.color,
            width: row.width!,
            height: row.height!,
          }
        : {
            id: row.id,
            kind: 'text',
            position: { x: row.position_x, y: row.position_y },
            color: row.color,
            text: row.text_content!,
            fontSize: row.font_size!,
            fontFamily: row.font_family!,
            fontWeight: row.font_weight!,
            fontStyle: row.font_style!,
          },
    ),
  };
}

export async function readStoryEditorInteractionPage(
  queryable: Queryable,
  options: ReadPageOptions,
): Promise<StoryEditorInteractionPage> {
  const { storyId, revision, page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  const result = await queryable.query<InteractionSummaryRow>(
    `SELECT id, title, position_x, position_y, location_id, sort_order
       FROM interactions WHERE story_id = $1
       ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
    [storyId, pageSize, offset],
  );
  return {
    revision,
    page,
    pageSize,
    hasMore: result.rows.length === pageSize,
    interactions: result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      position: { x: row.position_x, y: row.position_y },
      locationId: row.location_id,
    })),
  };
}

export async function readStoryEditorTriggerPage(
  queryable: Queryable,
  options: ReadPageOptions,
): Promise<StoryEditorTriggerPage> {
  const { storyId, revision, page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  const triggers = await queryable.query<TriggerStructureRow>(
    `SELECT triggers.id, triggers.output_interaction_id, triggers.position_x,
            triggers.position_y, interactions.sort_order AS interaction_sort_order,
            triggers.sort_order
       FROM triggers
       JOIN interactions ON interactions.id = triggers.output_interaction_id
       WHERE interactions.story_id = $1
       ORDER BY interactions.sort_order, triggers.sort_order, triggers.id
       LIMIT $2 OFFSET $3`,
    [storyId, pageSize, offset],
  );
  const triggerIds = triggers.rows.map(({ id }) => id);
  const inputs = triggerIds.length
    ? await queryable.query<TriggerInputRow>(
        `SELECT trigger_id, input_interaction_id, sort_order
           FROM trigger_inputs WHERE trigger_id = ANY($1::text[])
           ORDER BY trigger_id, sort_order`,
        [triggerIds],
      )
    : { rows: [] as TriggerInputRow[] };
  const inputsByTrigger = groupBy(inputs.rows, ({ trigger_id }) => trigger_id);
  return {
    revision,
    page,
    pageSize,
    hasMore: triggers.rows.length === pageSize,
    triggers: triggers.rows.map((row) => ({
      id: row.id,
      outputInteractionId: row.output_interaction_id,
      inputInteractionIds: (inputsByTrigger.get(row.id) ?? []).map(
        ({ input_interaction_id }) => input_interaction_id,
      ),
      ...(typeof row.position_x === 'number' && typeof row.position_y === 'number'
        ? { position: { x: row.position_x, y: row.position_y } }
        : {}),
    })),
  };
}

export async function readStoryEditorInteractionContentPage(
  queryable: Queryable,
  options: ReadPageOptions,
): Promise<StoryEditorInteractionContentPage> {
  const { storyId, revision, page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  const interactions = await queryable.query<InteractionContentRow>(
    `SELECT id, body, duration_minutes, conditional_text_blocks, sort_order
       FROM interactions WHERE story_id = $1
       ORDER BY sort_order, id LIMIT $2 OFFSET $3`,
    [storyId, pageSize, offset],
  );
  const interactionIds = interactions.rows.map(({ id }) => id);
  const [characters, statEffects, itemEffects] = interactionIds.length
    ? await Promise.all([
        queryable.query<InteractionCharacterRow>(
          `SELECT interaction_id, character_id, sort_order
             FROM interaction_characters WHERE interaction_id = ANY($1::text[])
             ORDER BY interaction_id, sort_order`,
          [interactionIds],
        ),
        queryable.query<StatEffectRow>(
          `SELECT interaction_id, stat_id, item_id, operation, value, sort_order
             FROM interaction_stat_effects WHERE interaction_id = ANY($1::text[])
             ORDER BY interaction_id, sort_order`,
          [interactionIds],
        ),
        queryable.query<ItemEffectRow>(
          `SELECT interaction_id, item_id, item_definition_id, character_id,
                  operation, sort_order
             FROM interaction_item_effects WHERE interaction_id = ANY($1::text[])
             ORDER BY interaction_id, sort_order`,
          [interactionIds],
        ),
      ])
    : [
        { rows: [] as InteractionCharacterRow[] },
        { rows: [] as StatEffectRow[] },
        { rows: [] as ItemEffectRow[] },
      ];
  const charactersByInteraction = groupBy(characters.rows, ({ interaction_id }) => interaction_id);
  const statEffectsByInteraction = groupBy(
    statEffects.rows,
    ({ interaction_id }) => interaction_id,
  );
  const itemEffectsByInteraction = groupBy(
    itemEffects.rows,
    ({ interaction_id }) => interaction_id,
  );
  return {
    revision,
    page,
    pageSize,
    hasMore: interactions.rows.length === pageSize,
    interactions: interactions.rows.map((row) => ({
      interactionId: row.id,
      body: row.body,
      durationMinutes: row.duration_minutes,
      conditionalTextBlocks: row.conditional_text_blocks,
      characterIds: (charactersByInteraction.get(row.id) ?? []).map(
        ({ character_id }) => character_id,
      ),
      statEffects: (statEffectsByInteraction.get(row.id) ?? []).map((effect) => ({
        statId: effect.stat_id,
        ...(effect.item_id ? { itemId: effect.item_id } : {}),
        operation: effect.operation,
        value: effect.value,
      })),
      itemEffects: (itemEffectsByInteraction.get(row.id) ?? []).map((effect) => ({
        ...(effect.item_id ? { itemId: effect.item_id } : {}),
        ...(effect.item_definition_id ? { itemDefinitionId: effect.item_definition_id } : {}),
        ...(effect.character_id ? { characterId: effect.character_id } : {}),
        operation: effect.operation,
      })),
    })),
  };
}

export async function readStoryEditorTriggerContentPage(
  queryable: Queryable,
  options: ReadPageOptions,
): Promise<StoryEditorTriggerContentPage> {
  const { storyId, revision, page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  const result = await queryable.query<TriggerContentRow>(
    `SELECT triggers.id, triggers.condition_groups, triggers.appearance_probability,
            triggers.timer_seconds, interactions.sort_order AS interaction_sort_order,
            triggers.sort_order
       FROM triggers
       JOIN interactions ON interactions.id = triggers.output_interaction_id
       WHERE interactions.story_id = $1
       ORDER BY interactions.sort_order, triggers.sort_order, triggers.id
       LIMIT $2 OFFSET $3`,
    [storyId, pageSize, offset],
  );
  return {
    revision,
    page,
    pageSize,
    hasMore: result.rows.length === pageSize,
    triggers: result.rows.map((row) => ({
      triggerId: row.id,
      conditionGroups: row.condition_groups,
      appearanceProbability: row.appearance_probability,
      timerSeconds: row.timer_seconds,
    })),
  };
}

function statOwner(row: StatAssignmentRow): { ownerId?: string } {
  if (row.owner_type === 'character' && row.character_id) return { ownerId: row.character_id };
  if (row.owner_type === 'location' && row.location_id) return { ownerId: row.location_id };
  if (row.owner_type === 'item_definition' && row.item_definition_id) {
    return { ownerId: row.item_definition_id };
  }
  return {};
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(key(item), [...(grouped.get(key(item)) ?? []), item]);
  return grouped;
}
