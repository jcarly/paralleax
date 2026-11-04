import type { StatValue, Story, TriggerConditionGroup } from '@paralleax/shared';

type StoryStatEffect = NonNullable<Story['interactions'][number]['statEffects']>[number];
type StoryItemEffect = NonNullable<Story['interactions'][number]['itemEffects']>[number];
type StoryTrigger = Story['interactions'][number]['triggers'][number];

export type PersistedStatEffectRow = {
  story_id?: string;
  interaction_id: string;
  stat_id: string;
  item_id: string | null;
  operation: 'add' | 'set';
  sort_order: number;
} & ({ value: StatValue; expression: null } | { value: null; expression: string });

export type PersistedItemEffectRow = {
  story_id?: string;
  interaction_id: string;
  item_id: string | null;
  item_definition_id: string | null;
  character_id: string | null;
  operation: 'obtain' | 'lose';
  sort_order: number;
};

export type PersistedTriggerRow = {
  story_id?: string;
  id: string;
  output_interaction_id: string;
  position_x: number | null;
  position_y: number | null;
  condition_groups: TriggerConditionGroup[];
  appearance_probability: number;
  timer_seconds: number | null;
  sort_order: number;
};

export type PersistedTriggerInputRow = {
  story_id?: string;
  trigger_id: string;
  input_interaction_id: string;
  sort_order: number;
};

export function projectStatEffects(rows: readonly PersistedStatEffectRow[]): StoryStatEffect[] {
  return rows.map((row) => ({
    statId: row.stat_id,
    ...(row.item_id ? { itemId: row.item_id } : {}),
    operation: row.operation,
    ...(typeof row.expression === 'string' ? { expression: row.expression } : { value: row.value }),
  }));
}

export function projectItemEffects(rows: readonly PersistedItemEffectRow[]): StoryItemEffect[] {
  return rows.map((row) => ({
    ...(row.item_id ? { itemId: row.item_id } : {}),
    ...(row.item_definition_id ? { itemDefinitionId: row.item_definition_id } : {}),
    ...(row.character_id ? { characterId: row.character_id } : {}),
    operation: row.operation,
  }));
}

export function projectTriggers(
  rows: readonly PersistedTriggerRow[],
  inputsByTrigger: ReadonlyMap<string, readonly PersistedTriggerInputRow[]>,
): StoryTrigger[] {
  return rows.map((row) => ({
    id: row.id,
    inputInteractionIds: (inputsByTrigger.get(row.id) ?? []).map(
      ({ input_interaction_id }) => input_interaction_id,
    ),
    conditionGroups: row.condition_groups,
    appearanceProbability: row.appearance_probability,
    timerSeconds: row.timer_seconds,
    ...(typeof row.position_x === 'number' && typeof row.position_y === 'number'
      ? { position: { x: row.position_x, y: row.position_y } }
      : {}),
  }));
}
