import type {
  ConditionalTextBlock,
  StatValue,
  StoryRuntimeSlice,
  TriggerConditionGroup,
} from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';

interface RuntimeSliceOptions {
  storyId: string;
  revision: number;
  currentInteractionId?: string | null;
  interactionIds: string[];
  includeOptions?: boolean;
  page: number;
  pageSize: number;
}

type CandidateInteractionRow = {
  id: string;
  sort_order: number;
  total_count: number | string;
};

type RuntimeInteractionRow = {
  id: string;
  title: string;
  body: string;
  position_x: number;
  position_y: number;
  location_id: string | null;
  duration_minutes: number;
  conditional_text_blocks: ConditionalTextBlock[];
  sort_order: number;
};

type RuntimeTriggerRow = {
  id: string;
  output_interaction_id: string;
  position_x: number | null;
  position_y: number | null;
  condition_groups: TriggerConditionGroup[];
  appearance_probability: number;
  timer_seconds: number | null;
  sort_order: number;
};

type RuntimeTriggerInputRow = {
  trigger_id: string;
  input_interaction_id: string;
  sort_order: number;
};

type RuntimeInteractionCharacterRow = {
  interaction_id: string;
  character_id: string;
  sort_order: number;
};

type RuntimeStatEffectRow = {
  interaction_id: string;
  stat_id: string;
  item_id: string | null;
  operation: 'add' | 'set';
  value: StatValue;
  sort_order: number;
};

type RuntimeItemEffectRow = {
  interaction_id: string;
  item_id: string | null;
  item_definition_id: string | null;
  character_id: string | null;
  operation: 'obtain' | 'lose';
  sort_order: number;
};

export async function readStoryRuntimeSlice(
  queryable: Queryable,
  options: RuntimeSliceOptions,
): Promise<StoryRuntimeSlice> {
  const currentInteractionId = options.currentInteractionId ?? null;
  const offset = (options.page - 1) * options.pageSize;
  const candidateInteractions =
    options.includeOptions === false
      ? { rows: [] as CandidateInteractionRow[] }
      : await queryable.query<CandidateInteractionRow>(
          `SELECT output.id, output.sort_order, COUNT(*) OVER() AS total_count
       FROM interactions AS output
       WHERE output.story_id = $1
         AND EXISTS (
           SELECT 1
           FROM triggers
           WHERE triggers.output_interaction_id = output.id
             AND (
               ($2::text IS NULL AND NOT EXISTS (
                 SELECT 1 FROM trigger_inputs WHERE trigger_inputs.trigger_id = triggers.id
               ))
               OR
               ($2::text IS NOT NULL AND (
                 EXISTS (
                   SELECT 1 FROM trigger_inputs
                   WHERE trigger_inputs.trigger_id = triggers.id
                     AND trigger_inputs.input_interaction_id = $2
                 )
                 OR (
                   NOT EXISTS (
                     SELECT 1 FROM trigger_inputs WHERE trigger_inputs.trigger_id = triggers.id
                   )
                   AND EXISTS (
                     SELECT 1
                     FROM jsonb_array_elements(COALESCE(triggers.condition_groups, '[]'::jsonb))
                       AS condition_group
                     WHERE jsonb_array_length(
                       COALESCE(condition_group.value -> 'conditions', '[]'::jsonb)
                     ) > 0
                   )
                 )
               ))
             )
         )
       ORDER BY output.sort_order, output.id
       LIMIT $3 OFFSET $4`,
          [options.storyId, currentInteractionId, options.pageSize, offset],
        );
  const optionInteractionIds = candidateInteractions.rows.map(({ id }) => id);
  const selectedInteractionIds = [...new Set([...options.interactionIds, ...optionInteractionIds])];
  const totalOptionCount = candidateInteractions.rows[0]
    ? Number(candidateInteractions.rows[0].total_count)
    : 0;

  if (selectedInteractionIds.length === 0) {
    return {
      revision: options.revision,
      page: options.page,
      pageSize: options.pageSize,
      totalOptionCount,
      hasMore: options.page * options.pageSize < totalOptionCount,
      optionInteractionIds,
      interactionReferences: [],
      interactions: [],
    };
  }

  const triggers =
    optionInteractionIds.length > 0
      ? await queryable.query<RuntimeTriggerRow>(
          `SELECT triggers.id, triggers.output_interaction_id, triggers.position_x,
                  triggers.position_y, triggers.condition_groups,
                  triggers.appearance_probability, triggers.timer_seconds, triggers.sort_order
             FROM triggers
             WHERE triggers.output_interaction_id = ANY($1::text[])
               AND (
                 ($2::text IS NULL AND NOT EXISTS (
                   SELECT 1 FROM trigger_inputs WHERE trigger_inputs.trigger_id = triggers.id
                 ))
                 OR
                 ($2::text IS NOT NULL AND (
                   EXISTS (
                     SELECT 1 FROM trigger_inputs
                     WHERE trigger_inputs.trigger_id = triggers.id
                       AND trigger_inputs.input_interaction_id = $2
                   )
                   OR (
                     NOT EXISTS (
                       SELECT 1 FROM trigger_inputs WHERE trigger_inputs.trigger_id = triggers.id
                     )
                     AND EXISTS (
                       SELECT 1
                       FROM jsonb_array_elements(
                         COALESCE(triggers.condition_groups, '[]'::jsonb)
                       ) AS condition_group
                       WHERE jsonb_array_length(
                         COALESCE(condition_group.value -> 'conditions', '[]'::jsonb)
                       ) > 0
                     )
                   )
                 ))
               )
             ORDER BY triggers.output_interaction_id, triggers.sort_order, triggers.id`,
          [optionInteractionIds, currentInteractionId],
        )
      : { rows: [] as RuntimeTriggerRow[] };
  const triggerIds = triggers.rows.map(({ id }) => id);
  const [interactions, triggerInputs, characters, statEffects, itemEffects] = await Promise.all([
    queryable.query<RuntimeInteractionRow>(
      `SELECT id, title, body, position_x, position_y, location_id, duration_minutes,
                conditional_text_blocks, sort_order
           FROM interactions
           WHERE story_id = $1 AND id = ANY($2::text[])
           ORDER BY sort_order, id`,
      [options.storyId, selectedInteractionIds],
    ),
    triggerIds.length > 0
      ? queryable.query<RuntimeTriggerInputRow>(
          `SELECT trigger_inputs.trigger_id, trigger_inputs.input_interaction_id,
                    trigger_inputs.sort_order
               FROM trigger_inputs
               WHERE trigger_inputs.trigger_id = ANY($1::text[])
               ORDER BY trigger_inputs.trigger_id, trigger_inputs.sort_order`,
          [triggerIds],
        )
      : Promise.resolve({ rows: [] as RuntimeTriggerInputRow[] }),
    queryable.query<RuntimeInteractionCharacterRow>(
      `SELECT interaction_id, character_id, sort_order
           FROM interaction_characters
           WHERE story_id = $1 AND interaction_id = ANY($2::text[])
           ORDER BY interaction_id, sort_order`,
      [options.storyId, selectedInteractionIds],
    ),
    queryable.query<RuntimeStatEffectRow>(
      `SELECT interaction_id, stat_id, item_id, operation, value, sort_order
           FROM interaction_stat_effects
           WHERE story_id = $1 AND interaction_id = ANY($2::text[])
           ORDER BY interaction_id, sort_order`,
      [options.storyId, selectedInteractionIds],
    ),
    queryable.query<RuntimeItemEffectRow>(
      `SELECT interaction_id, item_id, item_definition_id, character_id, operation, sort_order
           FROM interaction_item_effects
           WHERE story_id = $1 AND interaction_id = ANY($2::text[])
           ORDER BY interaction_id, sort_order`,
      [options.storyId, selectedInteractionIds],
    ),
  ]);

  const triggersByInteraction = groupBy(
    triggers.rows,
    ({ output_interaction_id }) => output_interaction_id,
  );
  const inputsByTrigger = groupBy(triggerInputs.rows, ({ trigger_id }) => trigger_id);
  const charactersByInteraction = groupBy(characters.rows, ({ interaction_id }) => interaction_id);
  const statEffectsByInteraction = groupBy(
    statEffects.rows,
    ({ interaction_id }) => interaction_id,
  );
  const itemEffectsByInteraction = groupBy(
    itemEffects.rows,
    ({ interaction_id }) => interaction_id,
  );
  const referencedInteractionIds = [
    ...new Set(
      triggers.rows.flatMap((trigger) =>
        trigger.condition_groups.flatMap((group) =>
          group.conditions.flatMap((condition) =>
            'interactionId' in condition ? [condition.interactionId] : [],
          ),
        ),
      ),
    ),
  ];
  const interactionReferences =
    referencedInteractionIds.length > 0
      ? await queryable.query<{ id: string; title: string }>(
          `SELECT id, title FROM interactions
             WHERE story_id = $1 AND id = ANY($2::text[])
             ORDER BY sort_order, id`,
          [options.storyId, referencedInteractionIds],
        )
      : { rows: [] };

  return {
    revision: options.revision,
    page: options.page,
    pageSize: options.pageSize,
    totalOptionCount,
    hasMore: options.page * options.pageSize < totalOptionCount,
    optionInteractionIds,
    interactionReferences: interactionReferences.rows,
    interactions: interactions.rows.map((interaction) => ({
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
      statEffects: (statEffectsByInteraction.get(interaction.id) ?? []).map((effect) => ({
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
  };
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) result.set(keyOf(item), [...(result.get(keyOf(item)) ?? []), item]);
  return result;
}
