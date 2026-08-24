import type { Character } from './characters.js';
import type { GraphDecoration } from './graph-decorations.js';
import type { Interaction } from './interactions.js';
import type { ItemDefinition } from './items.js';
import type { Location } from './locations.js';
import type { StatAssignment, StatDefinition } from './stats.js';
import type { StoryAccessCapabilities, StoryAccessSettings } from '../access-control.js';

export interface Story {
  id: string;
  revision?: number;
  title: string;
  locations?: Location[];
  characters?: Character[];
  stats?: StatAssignment[];
  statDefinitions?: StatDefinition[];
  itemDefinitions?: ItemDefinition[];
  graphDecorations?: GraphDecoration[];
  interactions: Interaction[];
  startDateTime?: string;
  access?: StoryAccessSettings;
  capabilities?: StoryAccessCapabilities;
  owner?: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

export interface StorySummary {
  id: string;
  revision?: number;
  title: string;
  interactionCount: number;
  startDateTime?: string;
  access?: StoryAccessSettings;
  capabilities?: StoryAccessCapabilities;
  owner?: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}
