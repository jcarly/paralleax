import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { storyHasBranchingChoice } from './branchingChoice';

function makeStory(inputByTarget: Record<string, string[]>): Story {
  return {
    interactions: Object.entries(inputByTarget).map(([targetId, inputInteractionIds]) => ({
      id: targetId,
      triggers: [{ id: `trigger-${targetId}`, inputInteractionIds }],
    })),
  } as Story;
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
