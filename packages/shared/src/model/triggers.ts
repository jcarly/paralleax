import type { TriggerCondition } from '../triggers/conditions.js';
import type { Position } from './common.js';

export interface TriggerConditionGroup {
  id: string;
  conditions: TriggerCondition[];
}

export interface Trigger {
  id: string;
  /** Stable probability input retained when a Trigger ID is remapped on import. */
  probabilityKey?: string;
  inputInteractionIds: string[];
  /** @deprecated Legacy single AND group. New writes use conditionGroups. */
  conditions?: TriggerCondition[];
  conditionGroups?: TriggerConditionGroup[];
  appearanceProbability?: number;
  timerSeconds?: number | null;
  position?: Position;
}
