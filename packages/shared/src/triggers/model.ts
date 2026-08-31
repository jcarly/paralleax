import type { Trigger, TriggerConditionGroup } from '../model/triggers.js';
import type { TriggerCondition } from './conditions.js';

export const DEFAULT_TRIGGER_APPEARANCE_PROBABILITY = 100;

export function getTriggerConditionGroups(trigger: Trigger): TriggerConditionGroup[] {
  if (trigger.conditionGroups && trigger.conditionGroups.length > 0) {
    return trigger.conditionGroups;
  }
  return [{ id: trigger.id, conditions: trigger.conditions ?? [] }];
}

export function getTriggerConditions(trigger: Trigger): TriggerCondition[] {
  return getTriggerConditionGroups(trigger).flatMap(({ conditions }) => conditions);
}

export function getTriggerAppearanceProbability(trigger: Trigger): number {
  return trigger.appearanceProbability ?? DEFAULT_TRIGGER_APPEARANCE_PROBABILITY;
}

export function toCanonicalTrigger(trigger: Trigger): Trigger {
  const canonical = { ...trigger };
  delete canonical.conditions;
  return {
    ...canonical,
    conditionGroups: getTriggerConditionGroups(trigger).map((group) => ({
      id: group.id,
      conditions: [...group.conditions],
    })),
    appearanceProbability: getTriggerAppearanceProbability(trigger),
  };
}
