import type { Position } from './common.js';
import type { ItemEffect } from './items.js';
import type { StatEffect } from './stats.js';
import type { Trigger } from './triggers.js';
import type { TriggerCondition } from '../triggers/conditions.js';

export const MAX_INTERACTION_BODY_LENGTH = 64_000;

export interface ConditionalTextBlock {
  id: string;
  conditions: TriggerCondition[];
}

export interface Interaction {
  id: string;
  title: string;
  body: string;
  position: Position;
  locationId?: string | null;
  characterIds?: string[];
  statEffects?: StatEffect[];
  itemEffects?: ItemEffect[];
  conditionalTextBlocks?: ConditionalTextBlock[];
  durationMinutes?: number;
  triggers: Trigger[];
}
