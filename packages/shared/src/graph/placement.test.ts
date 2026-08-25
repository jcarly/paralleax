import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import {
  ensureStoryInteractionPositions,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
} from './placement.js';

describe('interaction placement', () => {
  it('fills missing interaction positions with stable defaults', () => {
    const story = storyFixture();
    delete (story.interactions[1] as Partial<Story['interactions'][number]>).position;

    expect(ensureStoryInteractionPositions(story).interactions[1].position).toEqual({
      x: 80,
      y: 252,
    });
  });

  it('finds the next child position below occupied vertical outputs', () => {
    const story = storyFixture();

    expect(getNextChildPosition(story, story.interactions[0])).toEqual({ x: 80, y: 648 });
  });

  it('finds the next child position when the parent has no stored position', () => {
    const story = storyFixture();
    delete (story.interactions[1] as Partial<Story['interactions'][number]>).position;

    expect(getNextChildPosition(story, story.interactions[1])).toEqual({ x: 80, y: 648 });
  });

  it('finds the next parent position above the target without overlap', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'other-parent',
      title: 'Other parent',
      body: 'Already there',
      position: { x: 80, y: 270 },
      triggers: [{ id: 'trigger-other-parent', inputInteractionIds: [], conditions: [] }],
    });

    expect(getNextParentPosition(story, story.interactions[2])).toEqual({ x: 80, y: -108 });
  });

  it('finds the next root position below the lowest existing root', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'second-root',
      title: 'Second root',
      body: 'Another start',
      position: { x: 80, y: 520 },
      triggers: [{ id: 'trigger-second-root', inputInteractionIds: [], conditions: [] }],
    });

    expect(getNextRootPosition(story)).toEqual({ x: 80, y: 652 });
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [
      interaction('root', [], 120),
      interaction('middle', ['root'], 270),
      interaction('end', ['root', 'middle'], 420),
    ],
  };
}

function interaction(id: string, inputInteractionIds: string[], y: number) {
  return {
    id,
    title: id,
    body: `${id} body`,
    position: { x: 80, y },
    triggers: [{ id: `trigger-${id}`, inputInteractionIds, conditions: [] }],
  };
}
