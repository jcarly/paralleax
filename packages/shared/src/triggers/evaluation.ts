import type { Interaction } from '../model/interactions.js';
import type { StatValue } from '../model/stats.js';
import type { Story } from '../model/stories.js';
import type { Trigger } from '../model/triggers.js';
import { DEFAULT_STORY_DATE_TIME } from '../time/calendar.js';
import { temporalConditionMatches } from '../time/conditions.js';
import type { TriggerCondition, TriggerConditionFailure } from './conditions.js';

export function isTriggerEligible(
  trigger: Trigger,
  currentInteractionId: string | null,
  visited: Set<string>,
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): boolean {
  return (
    doesTriggerInputMatch(trigger, currentInteractionId) &&
    trigger.conditions.every((condition) =>
      conditionMatches(
        condition,
        visited,
        currentLocationId,
        currentCharacterIds,
        statValues,
        currentDateTime,
        ownedItemDefinitionIds,
        itemStatValues,
      ),
    )
  );
}

export function doesTriggerInputMatch(
  trigger: Trigger,
  currentInteractionId: string | null,
): boolean {
  const hasInputs = trigger.inputInteractionIds.length > 0;
  const hasConditions = trigger.conditions.length > 0;
  return hasInputs
    ? currentInteractionId !== null && trigger.inputInteractionIds.includes(currentInteractionId)
    : hasConditions || currentInteractionId === null;
}

export function getAvailableInteractions(
  story: Story,
  currentInteractionId: string | null,
  visitedIds: string[],
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = story.startDateTime ?? DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): Interaction[] {
  const visited = new Set(visitedIds);
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) =>
      isTriggerEligible(
        trigger,
        currentInteractionId,
        visited,
        currentLocationId,
        currentCharacterIds,
        statValues,
        currentDateTime,
        ownedItemDefinitionIds,
        itemStatValues,
      ),
    ),
  );
}

export function getInputReachableInteractions(
  story: Story,
  currentInteractionId: string | null,
): Interaction[] {
  return story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => doesTriggerInputMatch(trigger, currentInteractionId)),
  );
}

export function getTriggerConditionFailures(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): TriggerConditionFailure[] {
  const visited = new Set(visitedIds);
  const inputMatchingTriggers = interaction.triggers.filter((trigger) =>
    doesTriggerInputMatch(trigger, currentInteractionId),
  );

  if (
    inputMatchingTriggers.some((trigger) =>
      trigger.conditions.every((condition) =>
        conditionMatches(
          condition,
          visited,
          currentLocationId,
          currentCharacterIds,
          statValues,
          currentDateTime,
          ownedItemDefinitionIds,
          itemStatValues,
        ),
      ),
    )
  ) {
    return [];
  }

  return inputMatchingTriggers.flatMap((trigger) =>
    trigger.conditions
      .filter(
        (condition) =>
          !conditionMatches(
            condition,
            visited,
            currentLocationId,
            currentCharacterIds,
            statValues,
            currentDateTime,
            ownedItemDefinitionIds,
            itemStatValues,
          ),
      )
      .map((condition) => ({ triggerId: trigger.id, condition })),
  );
}

function conditionMatches(
  condition: TriggerCondition,
  visited: Set<string>,
  currentLocationId: string | null,
  currentCharacterIds: string[],
  statValues: Readonly<Record<string, StatValue>>,
  currentDateTime: string,
  ownedItemDefinitionIds: readonly string[],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
) {
  if ('interactionId' in condition) {
    return condition.hasBeenVisited
      ? visited.has(condition.interactionId)
      : !visited.has(condition.interactionId);
  }
  if ('locationId' in condition) {
    const matches = currentLocationId === condition.locationId;
    return condition.isCurrentLocation ? matches : !matches;
  }
  if ('characterId' in condition) {
    const isPresent = currentCharacterIds.includes(condition.characterId);
    return condition.isPresent ? isPresent : !isPresent;
  }
  if ('itemDefinitionId' in condition) {
    const isOwned = ownedItemDefinitionIds.includes(condition.itemDefinitionId);
    return condition.isOwned ? isOwned : !isOwned;
  }
  if ('temporal' in condition) return temporalConditionMatches(condition, currentDateTime);
  const currentValue = condition.itemId
    ? itemStatValues[condition.itemId]?.[condition.statId]
    : statValues[condition.statId];
  if (currentValue === undefined || typeof currentValue !== typeof condition.value) return false;
  if (condition.operator === 'eq') return currentValue === condition.value;
  if (condition.operator === 'neq') return currentValue !== condition.value;
  if (typeof currentValue !== 'number' || typeof condition.value !== 'number') return false;
  if (condition.operator === 'lt') return currentValue < condition.value;
  if (condition.operator === 'lte') return currentValue <= condition.value;
  if (condition.operator === 'gt') return currentValue > condition.value;
  return currentValue >= condition.value;
}
