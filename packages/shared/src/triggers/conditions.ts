import type { TemporalCondition } from '../time/types.js';
import type { StatValue } from '../model/stats.js';

export interface InteractionVisitedCondition {
  interactionId: string;
  hasBeenVisited: boolean;
}

export interface LocationCondition {
  locationId: string;
  isCurrentLocation: boolean;
}

export interface CharacterCondition {
  characterId: string;
  isPresent: boolean;
}

export type StatComparisonOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';

interface StatConditionBase {
  statId: string;
  itemId?: string;
  operator: StatComparisonOperator;
}

export interface StatLiteralCondition extends StatConditionBase {
  value: StatValue;
}

export interface StatAssignmentCondition extends StatConditionBase {
  comparisonStatId: string;
  comparisonItemId?: string;
}

export type StatCondition = StatLiteralCondition | StatAssignmentCondition;

export interface ItemCondition {
  itemDefinitionId: string;
  isOwned: boolean;
}

export type TriggerCondition =
  | InteractionVisitedCondition
  | LocationCondition
  | CharacterCondition
  | StatCondition
  | ItemCondition
  | TemporalCondition;

export interface TriggerConditionFailure {
  triggerId: string;
  conditionGroupId: string;
  condition: TriggerCondition;
}

export interface TriggerProbabilityFailure {
  triggerId: string;
  appearanceProbability: number;
  roll: number;
}

export interface TriggerTimerFailure {
  triggerId: string;
  timerSeconds: number;
  elapsedTimeMs: number;
}
