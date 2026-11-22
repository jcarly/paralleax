import { BadRequestException } from '@nestjs/common';
import { isStoryDate, isStoryTime, type Story, type TriggerCondition } from '@paralleax/shared';
import type { TriggerConditionDto } from '../dto/stories.dto';
import { buildStatCondition } from './story-stats';

/*
 * Builds canonical Trigger conditions from request conditions, checking that
 * each one has exactly one supported kind and only references entities of the
 * same Story. Shared by Trigger and conditional text edits.
 */

type ConditionKind = 'interaction' | 'location' | 'character' | 'stat' | 'item' | 'temporal';
type ConditionReferences = {
  interactions: ReadonlySet<string>;
  locations: ReadonlySet<string>;
  characters: ReadonlySet<string>;
  itemDefinitions: ReadonlySet<string>;
};

function conditionValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new BadRequestException('Condition is invalid');
  }
  return value;
}

function matchesInteractionCondition(condition: TriggerConditionDto): boolean {
  return condition.interactionId !== undefined && condition.hasBeenVisited !== undefined;
}

function matchesLocationCondition(condition: TriggerConditionDto): boolean {
  return condition.locationId !== undefined && condition.isCurrentLocation !== undefined;
}

function matchesCharacterCondition(condition: TriggerConditionDto): boolean {
  return condition.characterId !== undefined && condition.isPresent !== undefined;
}

function matchesStatCondition(condition: TriggerConditionDto): boolean {
  const statOperandCount = [
    condition.value !== undefined,
    condition.comparisonStatId !== undefined,
    condition.expression !== undefined,
  ].filter(Boolean).length;
  return (
    condition.statId !== undefined && condition.operator !== undefined && statOperandCount === 1
  );
}

function matchesItemCondition(condition: TriggerConditionDto): boolean {
  return condition.itemDefinitionId !== undefined && condition.isOwned !== undefined;
}

function conditionKind(condition: TriggerConditionDto): ConditionKind {
  const supportedKinds: Array<[ConditionKind, boolean]> = [
    ['interaction', matchesInteractionCondition(condition)],
    ['location', matchesLocationCondition(condition)],
    ['character', matchesCharacterCondition(condition)],
    ['stat', matchesStatCondition(condition)],
    ['item', matchesItemCondition(condition)],
    ['temporal', condition.temporal !== undefined],
  ];
  const kinds = supportedKinds.filter(([, matches]) => matches).map(([kind]) => kind);
  if (kinds.length !== 1) {
    throw new BadRequestException('A condition must contain exactly one supported condition type');
  }
  return kinds[0];
}

export function buildConditions(
  story: Story,
  conditions: TriggerConditionDto[],
): TriggerCondition[] {
  const references: ConditionReferences = {
    interactions: new Set(story.interactions.map(({ id }) => id)),
    locations: new Set((story.locations ?? []).map(({ id }) => id)),
    characters: new Set((story.characters ?? []).map(({ id }) => id)),
    itemDefinitions: new Set((story.itemDefinitions ?? []).map(({ id }) => id)),
  };
  return conditions.map((condition) => buildCondition(story, condition, references));
}

function buildCondition(
  story: Story,
  condition: TriggerConditionDto,
  references: ConditionReferences,
): TriggerCondition {
  switch (conditionKind(condition)) {
    case 'interaction':
      return interactionCondition(references, condition);
    case 'location':
      return locationCondition(references, condition);
    case 'character':
      return characterCondition(references, condition);
    case 'stat':
      return statCondition(story, condition);
    case 'item':
      return itemCondition(references, condition);
    case 'temporal':
      return temporalCondition(condition);
    default:
      throw new BadRequestException('Condition is invalid');
  }
}

function interactionCondition(
  references: ConditionReferences,
  condition: TriggerConditionDto,
): TriggerCondition {
  const interactionId = conditionValue(condition.interactionId);
  const hasBeenVisited = conditionValue(condition.hasBeenVisited);
  assertConditionReference(references.interactions, interactionId);
  return { interactionId, hasBeenVisited };
}

function locationCondition(
  references: ConditionReferences,
  condition: TriggerConditionDto,
): TriggerCondition {
  const locationId = conditionValue(condition.locationId);
  const isCurrentLocation = conditionValue(condition.isCurrentLocation);
  assertConditionReference(references.locations, locationId);
  return { locationId, isCurrentLocation };
}

function characterCondition(
  references: ConditionReferences,
  condition: TriggerConditionDto,
): TriggerCondition {
  const characterId = conditionValue(condition.characterId);
  const isPresent = conditionValue(condition.isPresent);
  assertConditionReference(references.characters, characterId);
  return { characterId, isPresent };
}

function itemCondition(
  references: ConditionReferences,
  condition: TriggerConditionDto,
): TriggerCondition {
  const itemDefinitionId = conditionValue(condition.itemDefinitionId);
  const isOwned = conditionValue(condition.isOwned);
  assertConditionReference(references.itemDefinitions, itemDefinitionId);
  return { itemDefinitionId, isOwned };
}

function statCondition(story: Story, condition: TriggerConditionDto): TriggerCondition {
  const target = {
    statId: conditionValue(condition.statId),
    ...(condition.itemId !== undefined && condition.itemId !== ''
      ? { itemId: condition.itemId }
      : {}),
    operator: conditionValue(condition.operator),
  };
  if (condition.comparisonStatId !== undefined) {
    return buildStatCondition(story, {
      ...target,
      comparisonStatId: condition.comparisonStatId,
      ...(condition.comparisonItemId !== undefined && condition.comparisonItemId !== ''
        ? { comparisonItemId: condition.comparisonItemId }
        : {}),
    });
  }
  if (condition.expression !== undefined) {
    return buildStatCondition(story, { ...target, expression: condition.expression });
  }
  return buildStatCondition(story, { ...target, value: conditionValue(condition.value) });
}

function temporalCondition(condition: TriggerConditionDto): TriggerCondition {
  const temporal = conditionValue(condition.temporal);
  const dates = [...new Set(temporal.dates ?? [])];
  const dateRanges = temporal.dateRanges ?? [];
  const weekdays = [...new Set(temporal.weekdays ?? [])];
  const timeSlots = temporal.timeSlots ?? [];
  if (
    dates.length + dateRanges.length + weekdays.length + timeSlots.length === 0 ||
    dates.some((date) => !isStoryDate(date)) ||
    dateRanges.some(
      ({ startDate, endDate }) =>
        !isStoryDate(startDate) || !isStoryDate(endDate) || startDate > endDate,
    ) ||
    timeSlots.some(
      ({ startTime, endTime }) =>
        !isStoryTime(startTime) || !isStoryTime(endTime) || startTime === endTime,
    )
  ) {
    throw new BadRequestException('Temporal condition is invalid');
  }
  return {
    temporal: {
      dates,
      dateRanges: dateRanges.map((range) => ({ ...range })),
      weekdays,
      timeSlots: timeSlots.map((slot) => ({ ...slot })),
    },
  };
}

function assertConditionReference(validIds: ReadonlySet<string>, referenceId: string): void {
  if (!validIds.has(referenceId)) {
    throw new BadRequestException('Condition references must belong to the same story');
  }
}
