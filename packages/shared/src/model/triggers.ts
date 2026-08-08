import type { TriggerCondition } from '../triggers/conditions.js';

export interface Trigger {
  id: string;
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}
