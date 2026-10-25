import type { Trigger } from '../model/triggers.js';
import type { TriggerCondition } from '../triggers/conditions.js';

export interface ImportedTriggerRoute<TCondition> {
  inputInteractionId: string;
  conditionGroups: TCondition[][];
}

export interface ImportedTriggerRouteGroup<TCondition> {
  inputInteractionIds: string[];
  conditionGroups: TCondition[][];
}

/**
 * Combines condition variants for each source-target pair, then shares a Trigger
 * only between sources with the same complete condition-group set.
 */
export function groupImportedTriggerRoutes<TCondition>(
  routes: readonly ImportedTriggerRoute<TCondition>[],
): ImportedTriggerRouteGroup<TCondition>[] {
  const groupsBySource = new Map<string, Map<string, TCondition[]>>();
  for (const route of routes) {
    const sourceGroups =
      groupsBySource.get(route.inputInteractionId) ?? new Map<string, TCondition[]>();
    for (const conditions of route.conditionGroups.length > 0 ? route.conditionGroups : [[]]) {
      const signature = JSON.stringify(conditions);
      if (!sourceGroups.has(signature)) sourceGroups.set(signature, conditions);
    }
    groupsBySource.set(route.inputInteractionId, sourceGroups);
  }

  const byConditionSet = new Map<string, ImportedTriggerRouteGroup<TCondition>>();
  for (const [inputInteractionId, sourceGroups] of groupsBySource) {
    const conditionGroups = [...sourceGroups.values()];
    const normalizedGroups = conditionGroups.some((conditions) => conditions.length === 0)
      ? [[]]
      : conditionGroups;
    const signature = JSON.stringify(normalizedGroups);
    const group = byConditionSet.get(signature) ?? {
      inputInteractionIds: [],
      conditionGroups: normalizedGroups,
    };
    group.inputInteractionIds.push(inputInteractionId);
    byConditionSet.set(signature, group);
  }
  return [...byConditionSet.values()];
}

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
