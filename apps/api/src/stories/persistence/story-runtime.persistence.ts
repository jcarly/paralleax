import type { ConditionalTextBlock, StoryRuntimeSlice } from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';
import {
  projectItemEffects,
  projectStatEffects,
  projectTriggers,
  type PersistedItemEffectRow,
  type PersistedStatEffectRow,
  type PersistedTriggerInputRow,
  type PersistedTriggerRow,
} from './story-projections';

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

type RuntimeInteractionCharacterRow = {
  interaction_id: string;
  character_id: string;
  sort_order: number;
};

const CANDIDATE_INTERACTION_SQL = `
SELECT output.id, output.sort_order, COUNT(*) OVER() AS total_count
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
LIMIT $3 OFFSET $4
`;

const RUNTIME_TRIGGER_SQL = `
SELECT triggers.id, triggers.output_interaction_id, triggers.position_x,
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
          FROM jsonb_array_elements(COALESCE(triggers.condition_groups, '[]'::jsonb))
            AS condition_group
          WHERE jsonb_array_length(
            COALESCE(condition_group.value -> 'conditions', '[]'::jsonb)
          ) > 0
        )
      )
    ))
  )
ORDER BY triggers.output_interaction_id, triggers.sort_order, triggers.id
`;

const RUNTIME_INTERACTIONS_SQL = `
SELECT id, title, body, position_x, position_y, location_id, duration_minutes,
       conditional_text_blocks, sort_order
FROM interactions
WHERE story_id = $1 AND id = ANY($2::text[])
ORDER BY sort_order, id
`;

const RUNTIME_TRIGGER_INPUTS_SQL = `
SELECT trigger_inputs.trigger_id, trigger_inputs.input_interaction_id, trigger_inputs.sort_order
FROM trigger_inputs
WHERE trigger_inputs.trigger_id = ANY($1::text[])
ORDER BY trigger_inputs.trigger_id, trigger_inputs.sort_order
`;

const RUNTIME_CHARACTERS_SQL = `
SELECT interaction_id, character_id, sort_order
FROM interaction_characters
WHERE story_id = $1 AND interaction_id = ANY($2::text[])
ORDER BY interaction_id, sort_order
`;

const RUNTIME_STAT_EFFECTS_SQL = `
SELECT interaction_id, stat_id, item_id, operation, value, expression, sort_order
FROM interaction_stat_effects
WHERE story_id = $1 AND interaction_id = ANY($2::text[])
ORDER BY interaction_id, sort_order
`;

const RUNTIME_ITEM_EFFECTS_SQL = `
SELECT interaction_id, item_id, item_definition_id, character_id, operation, sort_order
FROM interaction_item_effects
WHERE story_id = $1 AND interaction_id = ANY($2::text[])
ORDER BY interaction_id, sort_order
`;

const INTERACTION_REFERENCES_SQL = `
SELECT id, title FROM interactions
WHERE story_id = $1 AND id = ANY($2::text[])
ORDER BY sort_order, id
`;

type RuntimeSliceRows = {
  interactions: RuntimeInteractionRow[];
  triggerRows: PersistedTriggerRow[];
  triggerInputs: PersistedTriggerInputRow[];
  characters: RuntimeInteractionCharacterRow[];
  statEffects: PersistedStatEffectRow[];
  itemEffects: PersistedItemEffectRow[];
  references: { id: string; title: string }[];
};

type RuntimeSliceQueryContext = {
  options: RuntimeSliceOptions;
  selectedInteractionIds: string[];
  optionInteractionIds: string[];
  currentInteractionId: string | null;
};

type RuntimeRowIndexes = {
  triggersByInteraction: Map<string, PersistedTriggerRow[]>;
  inputsByTrigger: Map<string, PersistedTriggerInputRow[]>;
  charactersByInteraction: Map<string, RuntimeInteractionCharacterRow[]>;
  statEffectsByInteraction: Map<string, PersistedStatEffectRow[]>;
  itemEffectsByInteraction: Map<string, PersistedItemEffectRow[]>;
};

export async function readStoryRuntimeSlice(
  queryable: Queryable,
  options: RuntimeSliceOptions,
): Promise<StoryRuntimeSlice> {
  const currentInteractionId = options.currentInteractionId ?? null;
  const offset = (options.page - 1) * options.pageSize;
  const candidates = await readCandidateInteractions(
    queryable,
    options,
    currentInteractionId,
    offset,
  );
  const optionInteractionIds = candidates.map(({ id }) => id);
  const totalOptionCount = getTotalOptionCount(candidates);
  const selectedInteractionIds = selectInteractionIds(options.interactionIds, optionInteractionIds);
  if (selectedInteractionIds.length === 0) {
    return emptyRuntimeSlice(options, optionInteractionIds, totalOptionCount);
  }

  const rows = await readRuntimeRows(queryable, {
    options,
    selectedInteractionIds,
    optionInteractionIds,
    currentInteractionId,
  });
  return {
    revision: options.revision,
    page: options.page,
    pageSize: options.pageSize,
    totalOptionCount,
    hasMore: runtimeSliceHasMore(options, totalOptionCount),
    optionInteractionIds,
    interactionReferences: rows.references,
    interactions: mapRuntimeInteractions(rows),
  };
}

async function readCandidateInteractions(
  queryable: Queryable,
  options: RuntimeSliceOptions,
  currentInteractionId: string | null,
  offset: number,
): Promise<CandidateInteractionRow[]> {
  if (options.includeOptions === false) {
    return [];
  }
  const result = await queryable.query<CandidateInteractionRow>(CANDIDATE_INTERACTION_SQL, [
    options.storyId,
    currentInteractionId,
    options.pageSize,
    offset,
  ]);
  return result.rows;
}

function getTotalOptionCount(candidates: CandidateInteractionRow[]) {
  const firstCandidate = candidates[0];
  return firstCandidate ? Number(firstCandidate.total_count) : 0;
}

function selectInteractionIds(interactionIds: string[], optionInteractionIds: string[]) {
  return [...new Set([...interactionIds, ...optionInteractionIds])];
}

function emptyRuntimeSlice(
  options: RuntimeSliceOptions,
  optionInteractionIds: string[],
  totalOptionCount: number,
): StoryRuntimeSlice {
  return {
    revision: options.revision,
    page: options.page,
    pageSize: options.pageSize,
    totalOptionCount,
    hasMore: runtimeSliceHasMore(options, totalOptionCount),
    optionInteractionIds,
    interactionReferences: [],
    interactions: [],
  };
}

function runtimeSliceHasMore(options: RuntimeSliceOptions, totalOptionCount: number) {
  return options.page * options.pageSize < totalOptionCount;
}

async function readRuntimeRows(
  queryable: Queryable,
  context: RuntimeSliceQueryContext,
): Promise<RuntimeSliceRows> {
  const { options, selectedInteractionIds, optionInteractionIds, currentInteractionId } = context;
  const triggerRows = await readRuntimeTriggers(
    queryable,
    optionInteractionIds,
    currentInteractionId,
  );
  const triggerIds = triggerRows.map(({ id }) => id);
  const referencedInteractionIds = collectReferencedInteractionIds(triggerRows);
  const [interactions, triggerInputs, characters, statEffects, itemEffects, references] =
    await Promise.all([
      readRuntimeInteractionRows(queryable, options.storyId, selectedInteractionIds),
      readRuntimeTriggerInputRows(queryable, triggerIds),
      readRuntimeCharacterRows(queryable, options.storyId, selectedInteractionIds),
      readRuntimeStatEffectRows(queryable, options.storyId, selectedInteractionIds),
      readRuntimeItemEffectRows(queryable, options.storyId, selectedInteractionIds),
      readInteractionReferences(queryable, options.storyId, referencedInteractionIds),
    ]);
  return {
    interactions,
    triggerRows,
    triggerInputs,
    characters,
    statEffects,
    itemEffects,
    references,
  };
}

async function readRuntimeTriggers(
  queryable: Queryable,
  optionInteractionIds: string[],
  currentInteractionId: string | null,
) {
  if (optionInteractionIds.length === 0) {
    return [];
  }
  const result = await queryable.query<PersistedTriggerRow>(RUNTIME_TRIGGER_SQL, [
    optionInteractionIds,
    currentInteractionId,
  ]);
  return result.rows;
}

async function readRuntimeInteractionRows(
  queryable: Queryable,
  storyId: string,
  interactionIds: string[],
) {
  const result = await queryable.query<RuntimeInteractionRow>(RUNTIME_INTERACTIONS_SQL, [
    storyId,
    interactionIds,
  ]);
  return result.rows;
}

async function readRuntimeTriggerInputRows(queryable: Queryable, triggerIds: string[]) {
  if (triggerIds.length === 0) {
    return [];
  }
  const result = await queryable.query<PersistedTriggerInputRow>(RUNTIME_TRIGGER_INPUTS_SQL, [
    triggerIds,
  ]);
  return result.rows;
}

async function readRuntimeCharacterRows(
  queryable: Queryable,
  storyId: string,
  interactionIds: string[],
) {
  const result = await queryable.query<RuntimeInteractionCharacterRow>(RUNTIME_CHARACTERS_SQL, [
    storyId,
    interactionIds,
  ]);
  return result.rows;
}

async function readRuntimeStatEffectRows(
  queryable: Queryable,
  storyId: string,
  interactionIds: string[],
) {
  const result = await queryable.query<PersistedStatEffectRow>(RUNTIME_STAT_EFFECTS_SQL, [
    storyId,
    interactionIds,
  ]);
  return result.rows;
}

async function readRuntimeItemEffectRows(
  queryable: Queryable,
  storyId: string,
  interactionIds: string[],
) {
  const result = await queryable.query<PersistedItemEffectRow>(RUNTIME_ITEM_EFFECTS_SQL, [
    storyId,
    interactionIds,
  ]);
  return result.rows;
}

async function readInteractionReferences(
  queryable: Queryable,
  storyId: string,
  interactionIds: string[],
) {
  if (interactionIds.length === 0) {
    return [];
  }
  const result = await queryable.query<{ id: string; title: string }>(INTERACTION_REFERENCES_SQL, [
    storyId,
    interactionIds,
  ]);
  return result.rows;
}

function collectReferencedInteractionIds(triggerRows: PersistedTriggerRow[]) {
  return [
    ...new Set(
      triggerRows.flatMap((trigger) =>
        trigger.condition_groups.flatMap((group) =>
          group.conditions.flatMap((condition) =>
            'interactionId' in condition ? [condition.interactionId] : [],
          ),
        ),
      ),
    ),
  ];
}

function mapRuntimeInteractions(rows: RuntimeSliceRows) {
  const indexes = indexRuntimeRows(rows);
  return rows.interactions.map((interaction) => mapRuntimeInteraction(interaction, indexes));
}

function indexRuntimeRows(rows: RuntimeSliceRows): RuntimeRowIndexes {
  return {
    triggersByInteraction: groupBy(
      rows.triggerRows,
      ({ output_interaction_id }) => output_interaction_id,
    ),
    inputsByTrigger: groupBy(rows.triggerInputs, ({ trigger_id }) => trigger_id),
    charactersByInteraction: groupBy(rows.characters, ({ interaction_id }) => interaction_id),
    statEffectsByInteraction: groupBy(rows.statEffects, ({ interaction_id }) => interaction_id),
    itemEffectsByInteraction: groupBy(rows.itemEffects, ({ interaction_id }) => interaction_id),
  };
}

function mapRuntimeInteraction(interaction: RuntimeInteractionRow, indexes: RuntimeRowIndexes) {
  return {
    id: interaction.id,
    title: interaction.title,
    body: interaction.body,
    position: { x: interaction.position_x, y: interaction.position_y },
    locationId: interaction.location_id,
    durationMinutes: interaction.duration_minutes,
    conditionalTextBlocks: interaction.conditional_text_blocks,
    characterIds: (indexes.charactersByInteraction.get(interaction.id) ?? []).map(
      ({ character_id }) => character_id,
    ),
    statEffects: projectStatEffects(indexes.statEffectsByInteraction.get(interaction.id) ?? []),
    itemEffects: projectItemEffects(indexes.itemEffectsByInteraction.get(interaction.id) ?? []),
    triggers: projectTriggers(
      indexes.triggersByInteraction.get(interaction.id) ?? [],
      indexes.inputsByTrigger,
    ),
  };
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    result.set(key, [...(result.get(key) ?? []), item]);
  }
  return result;
}
