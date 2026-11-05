import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { storyHasAuthoredScene, storyHasBranchingChoice } from './branchingChoice';

function makeStory(
  inputByTarget: Record<string, string[]>,
  bodyByTarget: Record<string, string> = {},
): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
    interactions: Object.entries(inputByTarget).map(([targetId, inputInteractionIds]) => ({
      id: targetId,
      title: targetId,
      body: bodyByTarget[targetId] ?? '',
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

describe('storyHasAuthoredScene', () => {
  it('ignores the default interaction prompt', () => {
    const story = makeStory({ root: [] }, { root: '<p>Describe what happens here.</p>' });

    expect(storyHasAuthoredScene(story)).toBe(false);
  });

  it('recognizes authored scene content', () => {
    const story = makeStory({ root: [] }, { root: '<p>Alice enters the atrium.</p>' });

    expect(storyHasAuthoredScene(story)).toBe(true);
  });
});
