import { describe, expect, it } from 'vitest';
import { getNextChildPosition, getNextParentPosition, type Story } from '@paralleax/shared';
import { getStoryGraphClickCreationPosition } from './storyGraphCreationLayout';

// Placement without ELK (a new Story's starter child, API and MCP creation, and the
// editor fallback) must match where ELK places the same Interaction, so the
// Trigger marker fits between the parent output and the child input.
function loneRoot(): Story {
  return {
    id: 'default-placement',
    title: 'Default placement',
    createdAt: '2026-11-20T08:00:00.000Z',
    updatedAt: '2026-11-20T08:00:00.000Z',
    interactions: [
      {
        id: 'root',
        title: '',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}

describe('default Interaction placement', () => {
  it('places a first child where ELK places it', async () => {
    const story = loneRoot();

    const elkPosition = await getStoryGraphClickCreationPosition(story, {
      kind: 'child',
      sourceId: 'root',
    });

    expect(getNextChildPosition(story, story.interactions[0])).toEqual(elkPosition);
  });

  it('places a first parent where ELK places it', async () => {
    const story = loneRoot();

    const elkPosition = await getStoryGraphClickCreationPosition(story, {
      kind: 'parent',
      targetId: 'root',
    });

    expect(getNextParentPosition(story, story.interactions[0])).toEqual(elkPosition);
  });
});
