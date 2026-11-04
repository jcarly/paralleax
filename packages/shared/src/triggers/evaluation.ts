import { evaluateExpression } from '../expressions/index.js';
import type { Interaction } from '../model/interactions.js';
import type { StatValue } from '../model/stats.js';
import type { Story } from '../model/stories.js';
import type { Trigger } from '../model/triggers.js';
import { DEFAULT_STORY_DATE_TIME } from '../time/calendar.js';
import { temporalConditionMatches } from '../time/conditions.js';
import type {
  StatCondition,
  TriggerCondition,
  TriggerConditionFailure,
  TriggerProbabilityFailure,
  TriggerTimerFailure,
} from './conditions.js';
import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerConditions,
  getTriggerTimerSeconds,
} from './model.js';

interface ConditionEvaluationContext {
  visited: ReadonlySet<string>;
  currentLocationId: string | null;
  currentCharacterIds: readonly string[];
  statValues: Readonly<Record<string, StatValue>>;
  currentDateTime: string;
  ownedItemDefinitionIds: readonly string[];
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>;
}

export interface TriggerProbabilityContext {
  randomSeed: string;
  step: number;
  forcedTriggerIds?: readonly string[];
}

export interface TriggerProbabilityResult {
  appearanceProbability: number;
  roll: number;
  succeeds: boolean;
}

export interface TriggerEvaluationContext extends TriggerProbabilityContext {
  elapsedTimeMs?: number;
}

export interface TriggerTimerResult {
  triggerId: string;
  timerSeconds: number;
  durationMs: number;
  elapsedTimeMs: number;
  remainingTimeMs: number;
  remainingRatio: number;
  expired: boolean;
}

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
  evaluationContext: TriggerEvaluationContext = {
    randomSeed: 'legacy-reader',
    step: visited.size,
  },
): boolean {
  const timer = getTriggerTimerResult(trigger, evaluationContext.elapsedTimeMs);
  return (
    doesTriggerInputMatch(trigger, currentInteractionId) &&
    doTriggerConditionGroupsMatch(
      trigger,
      visited,
      currentLocationId,
      currentCharacterIds,
      statValues,
      currentDateTime,
      ownedItemDefinitionIds,
      itemStatValues,
    ) &&
    getTriggerProbabilityResult(trigger, evaluationContext).succeeds &&
    timer?.expired !== true
  );
}

export function doTriggerConditionGroupsMatch(
  trigger: Trigger,
  visited: ReadonlySet<string>,
  currentLocationId: string | null = null,
  currentCharacterIds: readonly string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): boolean {
  return conditionGroupsMatch(trigger, {
    visited,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
    itemStatValues,
  });
}

export function getTriggerProbabilityResult(
  trigger: Trigger,
  context: TriggerProbabilityContext,
): TriggerProbabilityResult {
  const appearanceProbability = getTriggerAppearanceProbability(trigger);
  const forced = context.forcedTriggerIds?.includes(trigger.id) ?? false;
  const roll = deterministicTriggerRoll(context.randomSeed, context.step, trigger.id);
  return {
    appearanceProbability,
    roll,
    succeeds: forced || appearanceProbability >= 100 || roll < appearanceProbability,
  };
}

export function getTriggerTimerResult(
  trigger: Trigger,
  elapsedTimeMs = 0,
): TriggerTimerResult | null {
  const timerSeconds = getTriggerTimerSeconds(trigger);
  if (timerSeconds === null) return null;
  const durationMs = timerSeconds * 1_000;
  const elapsed = Number.isFinite(elapsedTimeMs) ? Math.max(0, elapsedTimeMs) : 0;
  const remainingTimeMs = Math.max(0, durationMs - elapsed);
  return {
    triggerId: trigger.id,
    timerSeconds,
    durationMs,
    elapsedTimeMs: elapsed,
    remainingTimeMs,
    remainingRatio: durationMs === 0 ? 0 : remainingTimeMs / durationMs,
    expired: durationMs === 0 || elapsed >= durationMs,
  };
}

export function deterministicTriggerRoll(
  randomSeed: string,
  step: number,
  triggerId: string,
): number {
  const value = `${randomSeed}:${step}:${triggerId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return ((hash >>> 0) / 0x1_0000_0000) * 100;
}

/** Evaluates an AND group using the same semantics as Trigger conditions. */
export function doConditionsMatch(
  conditions: readonly TriggerCondition[],
  visited: ReadonlySet<string>,
  currentLocationId: string | null = null,
  currentCharacterIds: readonly string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): boolean {
  return conditionsMatch(conditions, {
    visited,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
    itemStatValues,
  });
}

export function doesTriggerInputMatch(
  trigger: Trigger,
  currentInteractionId: string | null,
): boolean {
  const hasInputs = trigger.inputInteractionIds.length > 0;
  const hasConditions = getTriggerConditions(trigger).length > 0;
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
  evaluationContext: TriggerEvaluationContext = {
    randomSeed: `legacy-reader:${story.id}`,
    step: visitedIds.length,
  },
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
        evaluationContext,
      ),
    ),
  );
}

export function getInteractionTimerState(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
  evaluationContext: TriggerEvaluationContext,
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): TriggerTimerResult | null {
  const candidates = getTimerCandidates(
    interaction,
    currentInteractionId,
    visitedIds,
    evaluationContext,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
    itemStatValues,
  );
  const timedCandidates = candidates.filter(
    (candidate): candidate is TriggerTimerResult => candidate !== null,
  );
  if (timedCandidates.length !== candidates.length) {
    return null;
  }
  return timedCandidates.reduce<TriggerTimerResult | null>(
    (longest, candidate) =>
      !longest || candidate.remainingTimeMs > longest.remainingTimeMs ? candidate : longest,
    null,
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
  const context: ConditionEvaluationContext = {
    visited,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
    itemStatValues,
  };
  const inputMatchingTriggers = interaction.triggers.filter((trigger) =>
    doesTriggerInputMatch(trigger, currentInteractionId),
  );

  if (inputMatchingTriggers.some((trigger) => conditionGroupsMatch(trigger, context))) {
    return [];
  }

  return inputMatchingTriggers.flatMap((trigger) =>
    getTriggerConditionGroups(trigger).flatMap((group) =>
      group.conditions
        .filter((condition) => !conditionMatches(condition, context))
        .map((condition) => ({
          triggerId: trigger.id,
          conditionGroupId: group.id,
          condition,
        })),
    ),
  );
}

export function getTriggerProbabilityFailures(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
  probabilityContext: TriggerProbabilityContext,
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): TriggerProbabilityFailure[] {
  const visited = new Set(visitedIds);
  const results = interaction.triggers.flatMap((trigger) => {
    if (
      !doesTriggerInputMatch(trigger, currentInteractionId) ||
      !doTriggerConditionGroupsMatch(
        trigger,
        visited,
        currentLocationId,
        currentCharacterIds,
        statValues,
        currentDateTime,
        ownedItemDefinitionIds,
        itemStatValues,
      )
    ) {
      return [];
    }
    return [{ trigger, result: getTriggerProbabilityResult(trigger, probabilityContext) }];
  });
  if (results.some(({ result }) => result.succeeds)) return [];
  return results.map(({ trigger, result }) => ({
    triggerId: trigger.id,
    appearanceProbability: result.appearanceProbability,
    roll: result.roll,
  }));
}

export function getTriggerTimerFailures(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
  evaluationContext: TriggerEvaluationContext,
  currentLocationId: string | null = null,
  currentCharacterIds: string[] = [],
  statValues: Readonly<Record<string, StatValue>> = {},
  currentDateTime = DEFAULT_STORY_DATE_TIME,
  ownedItemDefinitionIds: readonly string[] = [],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> = {},
): TriggerTimerFailure[] {
  const candidates = getTimerCandidates(
    interaction,
    currentInteractionId,
    visitedIds,
    evaluationContext,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
    itemStatValues,
  );
  const expiredCandidates = candidates.filter(
    (candidate): candidate is TriggerTimerResult => candidate !== null && candidate.expired,
  );
  if (expiredCandidates.length !== candidates.length) {
    return [];
  }
  return expiredCandidates.map(({ triggerId, timerSeconds, elapsedTimeMs }) => ({
    triggerId,
    timerSeconds,
    elapsedTimeMs,
  }));
}

function getTimerCandidates(
  interaction: Interaction,
  currentInteractionId: string | null,
  visitedIds: string[],
  evaluationContext: TriggerEvaluationContext,
  currentLocationId: string | null,
  currentCharacterIds: string[],
  statValues: Readonly<Record<string, StatValue>>,
  currentDateTime: string,
  ownedItemDefinitionIds: readonly string[],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
): Array<TriggerTimerResult | null> {
  const visited = new Set(visitedIds);
  return interaction.triggers.flatMap((trigger) => {
    if (
      !doesTriggerInputMatch(trigger, currentInteractionId) ||
      !doTriggerConditionGroupsMatch(
        trigger,
        visited,
        currentLocationId,
        currentCharacterIds,
        statValues,
        currentDateTime,
        ownedItemDefinitionIds,
        itemStatValues,
      ) ||
      !getTriggerProbabilityResult(trigger, evaluationContext).succeeds
    ) {
      return [];
    }
    return [getTriggerTimerResult(trigger, evaluationContext.elapsedTimeMs)];
  });
}

function conditionGroupsMatch(trigger: Trigger, context: ConditionEvaluationContext): boolean {
  return getTriggerConditionGroups(trigger).some(({ conditions }) =>
    conditionsMatch(conditions, context),
  );
}

function conditionsMatch(
  conditions: readonly TriggerCondition[],
  context: ConditionEvaluationContext,
): boolean {
  return conditions.every((condition) => conditionMatches(condition, context));
}

function conditionMatches(
  condition: TriggerCondition,
  context: ConditionEvaluationContext,
): boolean {
  if ('interactionId' in condition) {
    const hasBeenVisited = context.visited.has(condition.interactionId);
    return condition.hasBeenVisited === hasBeenVisited;
  }
  if ('locationId' in condition) {
    const matches = context.currentLocationId === condition.locationId;
    return condition.isCurrentLocation === matches;
  }
  if ('characterId' in condition) {
    const isPresent = context.currentCharacterIds.includes(condition.characterId);
    return condition.isPresent === isPresent;
  }
  if ('itemDefinitionId' in condition) {
    const isOwned = context.ownedItemDefinitionIds.includes(condition.itemDefinitionId);
    return condition.isOwned === isOwned;
  }
  if ('temporal' in condition) {
    return temporalConditionMatches(condition, context.currentDateTime);
  }

  return statConditionMatches(condition, context);
}

function statConditionMatches(
  condition: StatCondition,
  context: ConditionEvaluationContext,
): boolean {
  const currentValue = getStatConditionValue(
    condition.statId,
    condition.itemId,
    context.statValues,
    context.itemStatValues,
  );
  const comparisonValue = getStatComparisonValue(condition, context);
  if (
    currentValue === undefined ||
    comparisonValue === undefined ||
    typeof currentValue !== typeof comparisonValue
  ) {
    return false;
  }
  return compareStatValues(condition.operator, currentValue, comparisonValue);
}

function getStatComparisonValue(
  condition: StatCondition,
  context: ConditionEvaluationContext,
): StatValue | undefined {
  if ('comparisonStatId' in condition && condition.comparisonStatId !== undefined) {
    return getStatConditionValue(
      condition.comparisonStatId,
      condition.comparisonItemId,
      context.statValues,
      context.itemStatValues,
    );
  }
  if ('expression' in condition && condition.expression !== undefined) {
    return evaluateConditionExpression(
      condition.expression,
      context.statValues,
      context.itemStatValues,
    );
  }
  return 'value' in condition ? condition.value : undefined;
}

function compareStatValues(
  operator: StatCondition['operator'],
  left: StatValue,
  right: StatValue,
): boolean {
  if (operator === 'eq') {
    return left === right;
  }
  if (operator === 'neq') {
    return left !== right;
  }
  if (typeof left !== 'number' || typeof right !== 'number') {
    return false;
  }
  switch (operator) {
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    default:
      return false;
  }
}

function evaluateConditionExpression(
  expression: string,
  statValues: Readonly<Record<string, StatValue>>,
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
): StatValue | undefined {
  const values: Record<string, StatValue> = { ...statValues };
  for (const [itemId, itemValues] of Object.entries(itemStatValues)) {
    for (const [statId, value] of Object.entries(itemValues)) {
      values[`${statId}|${itemId}`] = value;
    }
  }
  const result = evaluateExpression(expression, values);
  if (typeof result === 'number' || typeof result === 'boolean' || typeof result === 'string') {
    return result;
  }
  return undefined;
}

function getStatConditionValue(
  statId: string,
  itemId: string | undefined,
  statValues: Readonly<Record<string, StatValue>>,
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
): StatValue | undefined {
  return itemId ? itemStatValues[itemId]?.[statId] : statValues[statId];
}
