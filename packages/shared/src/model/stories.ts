import type { Character } from './characters.js';
import type { Interaction } from './interactions.js';
import type { ItemDefinition } from './items.js';
import type { Location } from './locations.js';
import type { StatDefinition } from './stats.js';

export interface Story {
  id: string;
  revision?: number;
  title: string;
  locations?: Location[];
  characters?: Character[];
  statDefinitions?: StatDefinition[];
  itemDefinitions?: ItemDefinition[];
  interactions: Interaction[];
  startDateTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorySummary {
  id: string;
  revision?: number;
  title: string;
  interactionCount: number;
  startDateTime?: string;
  createdAt: string;
  updatedAt: string;
}
