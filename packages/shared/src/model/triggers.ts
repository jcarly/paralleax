import type { TriggerCondition } from '../triggers/conditions.js';
import type { Position } from './common.js';

export interface Trigger {
  id: string;
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
  position?: Position;
}
