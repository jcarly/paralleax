import type { Story, Trigger } from '../model/index.js';
import { DEFAULT_STORY_DATE_TIME } from '../time/index.js';
import type { TriggerCondition } from '../triggers/index.js';

type DemoStoryData = Pick<Story, 'title' | 'interactions'> &
  Partial<
    Pick<
      Story,
      | 'locations'
      | 'characters'
      | 'stats'
      | 'statDefinitions'
      | 'itemDefinitions'
      | 'graphDecorations'
    >
  >;

export function buildDemoStory(storyId: string, timestamp: string, data: DemoStoryData): Story {
  return {
    id: storyId,
    revision: 1,
    title: data.title,
    startDateTime: DEFAULT_STORY_DATE_TIME,
    locations: data.locations ?? [],
    characters: data.characters ?? [],
    stats: data.stats ?? [],
    statDefinitions: data.statDefinitions ?? [],
    itemDefinitions: data.itemDefinitions ?? [],
    graphDecorations: data.graphDecorations ?? [],
    interactions: data.interactions,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function demoEntityId(storyId: string, localId: string): string {
  return `${storyId}:${localId}`;
}

export function buildDemoTrigger(
  storyId: string,
  localId: string,
  inputInteractionIds: string[],
  conditions: TriggerCondition[] = [],
): Trigger {
  const id = demoEntityId(storyId, `trigger-${localId}`);
  return {
    id,
    inputInteractionIds,
    conditionGroups: [{ id: `${id}:conditions`, conditions }],
    appearanceProbability: 100,
  };
}
