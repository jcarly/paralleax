import type { TemporalCondition } from '../time/types.js';

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

export type StatComparisonOperator = 'eq' | 'lt' | 'lte' | 'gt' | 'gte';

export interface CharacterStatCondition {
  statId: string;
  operator: StatComparisonOperator;
  value: number;
}

export interface ItemCondition {
  itemDefinitionId: string;
  isOwned: boolean;
}

export type TriggerCondition =
  | InteractionVisitedCondition
  | LocationCondition
  | CharacterCondition
  | CharacterStatCondition
  | ItemCondition
  | TemporalCondition;

export interface TriggerConditionFailure {
  triggerId: string;
  condition: TriggerCondition;
}
