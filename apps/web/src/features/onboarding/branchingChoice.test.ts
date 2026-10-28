import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { storyHasBranchingChoice } from './branchingChoice';

function makeStory(inputByTarget: Record<string, string[]>): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    interactions: Object.entries(inputByTarget).map(([targetId, inputInteractionIds]) => ({
      id: targetId,
      title: targetId,
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: `trigger-${targetId}`, inputInteractionIds }],
    })),
  };
}

describe('storyHasBranchingChoice', () => {
  it('recognizes two connected destinations from one interaction', () => {
    const story = makeStory({ root: [], first: ['root'], second: ['root'] });

    expect(storyHasBranchingChoice(story)).toBe(true);
  });

  it('does not treat one route or alternative inputs as a choice', () => {
    const story = makeStory({ root: [], child: ['root'] });

    expect(storyHasBranchingChoice(story)).toBe(false);
  });
});
