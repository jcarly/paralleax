import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { findInteraction, findRootTrigger, findSelectedTrigger } from './storySelection';

const story: Story = {
  id: 'story-1',
  title: 'Selection story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-root',
      title: 'Root',
      body: 'Root body',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'interaction-child',
      title: 'Child',
      body: 'Child body',
      position: { x: 80, y: 270 },
      triggers: [
        {
          id: 'trigger-linked',
          inputInteractionIds: ['interaction-root'],
          conditions: [],
        },
      ],
    },
  ],
};

describe('story selection helpers', () => {
  it('finds an interaction by id', () => {
    expect(findInteraction(story, 'interaction-child')?.title).toBe('Child');
  });

  it('returns undefined when an interaction is missing', () => {
    expect(findInteraction(story, 'missing')).toBeUndefined();
    expect(findInteraction(undefined, 'interaction-root')).toBeUndefined();
    expect(findInteraction(story, undefined)).toBeUndefined();
  });

  it('finds the selected trigger and its owning interaction', () => {
    expect(
      findSelectedTrigger(story, {
        interactionId: 'interaction-child',
        triggerId: 'trigger-linked',
        inputInteractionId: 'interaction-root',
      }),
    ).toEqual({
      interaction: story.interactions[1],
      trigger: story.interactions[1].triggers[0],
    });
  });

  it('returns undefined when the selected trigger target is stale', () => {
    expect(
      findSelectedTrigger(story, {
        interactionId: 'interaction-child',
        triggerId: 'missing-trigger',
      }),
    ).toBeUndefined();
    expect(findSelectedTrigger(undefined, undefined)).toBeUndefined();
  });

  it('finds only root triggers without inputs', () => {
    expect(findRootTrigger(story.interactions[0])?.id).toBe('trigger-root');
    expect(findRootTrigger(story.interactions[1])).toBeUndefined();
    expect(findRootTrigger(undefined)).toBeUndefined();
  });
});
