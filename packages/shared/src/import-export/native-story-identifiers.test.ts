import { describe, expect, it } from 'vitest';
import type { NativeStoryContent } from './native-story.js';
import { findDuplicateNativeStoryIdentifier } from './native-story-identifiers.js';

function story(): NativeStoryContent {
  return {
    title: 'Story',
    stats: [{ id: 'score', statDefinitionId: 'definition', initialValue: 1 }],
    characters: [{ id: 'a', name: 'A', description: '', stats: [] }],
    interactions: [
      { id: 'a', title: '', body: '', position: { x: 0, y: 0 }, triggers: [] },
      { id: 'b', title: '', body: '', position: { x: 1, y: 1 }, triggers: [] },
    ],
  };
}

describe('native Story identifier checks', () => {
  it('allows distinct entity types to have the same id', () => {
    expect(findDuplicateNativeStoryIdentifier(story())).toBeUndefined();
  });

  it('reports both paths when assignments collide across owners', () => {
    const input = story();
    input.characters?.[0].stats?.push({
      id: 'score',
      statDefinitionId: 'definition',
      initialValue: 2,
    });
    expect(findDuplicateNativeStoryIdentifier(input)).toEqual({
      id: 'score',
      firstPath: '$.story.stats[0].id',
      path: '$.story.characters[0].stats[0].id',
    });
  });

  it('detects duplicate trigger IDs across interactions', () => {
    const input = story();
    input.interactions[0].triggers.push({ id: 't', inputInteractionIds: [] });
    input.interactions[1].triggers.push({ id: 't', inputInteractionIds: [] });
    expect(findDuplicateNativeStoryIdentifier(input)).toEqual({
      id: 't',
      firstPath: '$.story.interactions[0].triggers[0].id',
      path: '$.story.interactions[1].triggers[0].id',
    });
  });

  it('checks condition group identifiers within each trigger', () => {
    const input = story();
    input.interactions[0].triggers.push({
      id: 't',
      inputInteractionIds: [],
      conditionGroups: [
        { id: 'group', conditions: [] },
        { id: 'group', conditions: [] },
      ],
    });
    expect(findDuplicateNativeStoryIdentifier(input)).toEqual({
      id: 'group',
      firstPath: '$.story.interactions[0].triggers[0].conditionGroups[0].id',
      path: '$.story.interactions[0].triggers[0].conditionGroups[1].id',
    });
  });
});
