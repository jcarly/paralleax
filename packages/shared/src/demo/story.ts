import type { Story } from '../model/index.js';
import { createCharacterItemsDemoStory } from './stories/character-items.js';
import { createComplexItemsDemoStory } from './stories/complex-items.js';
import { createPathsOnlyDemoStory } from './stories/paths-only.js';
import { createVisitedConditionsDemoStory } from './stories/visited-conditions.js';
import { createWorldVariablesDemoStory } from './stories/world-variables.js';

export const DEMO_STORY_KINDS = [
  'paths-only',
  'visited-conditions',
  'world-variables',
  'character-items',
  'complex-items',
] as const;

export type DemoStoryKind = (typeof DEMO_STORY_KINDS)[number];

const creators = {
  'paths-only': createPathsOnlyDemoStory,
  'visited-conditions': createVisitedConditionsDemoStory,
  'world-variables': createWorldVariablesDemoStory,
  'character-items': createCharacterItemsDemoStory,
  'complex-items': createComplexItemsDemoStory,
} satisfies Record<DemoStoryKind, (storyId: string, timestamp: string) => Story>;

export function createDemoStory(kind: DemoStoryKind, storyId: string, timestamp: string): Story {
  return creators[kind](storyId, timestamp);
}

export function createDemoStories(
  timestamp: string,
  storyIdFactory: (kind: DemoStoryKind) => string,
): Story[] {
  return DEMO_STORY_KINDS.map((kind) => createDemoStory(kind, storyIdFactory(kind), timestamp));
}
