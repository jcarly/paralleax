import type { Trigger } from '../model/triggers.js';
import type { TriggerCondition } from '../triggers/conditions.js';

export function buildImportedTrigger(
  id: string,
  inputInteractionIds: string[],
  sourceConditionGroups: TriggerCondition[][],
): Trigger {
  const groups = sourceConditionGroups.length > 0 ? sourceConditionGroups : [[]];
  return {
    id,
    inputInteractionIds,
    conditionGroups: groups.map((conditions, index) => ({
      id: groups.length === 1 ? `${id}:conditions` : `${id}:conditions:${index}`,
      conditions,
    })),
    appearanceProbability: 100,
    timerSeconds: null,
  };
}
