import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { planTriggerInputDeletion } from './storyTriggerInput';

const story: Story = {
  id: 'story-1',
  title: 'Trigger input story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'First',
      body: 'First body',
      position: { x: 80, y: 120 },
      triggers: [],
    },
    {
      id: 'interaction-2',
      title: 'Second',
      body: 'Second body',
      position: { x: 420, y: 120 },
      triggers: [
        {
          id: 'trigger-single',
          inputInteractionIds: ['interaction-1'],
          conditions: [],
        },
        {
          id: 'trigger-multiple',
          inputInteractionIds: ['interaction-1', 'interaction-3'],
          conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
        },
      ],
    },
    {
      id: 'interaction-3',
      title: 'Third',
      body: 'Third body',
      position: { x: 80, y: 320 },
      triggers: [],
    },
  ],
};

describe('trigger input deletion planning', () => {
  it('plans an empty root trigger when the selected input is its last input', () => {
    expect(
      planTriggerInputDeletion(story, 'interaction-2', 'trigger-single', 'interaction-1'),
    ).toEqual({ inputInteractionIds: [], conditions: [] });
  });

  it('updates the trigger when other inputs remain', () => {
    expect(
      planTriggerInputDeletion(story, 'interaction-2', 'trigger-multiple', 'interaction-1'),
    ).toEqual({
      inputInteractionIds: ['interaction-3'],
      conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
    });
  });

  it('returns undefined when the story, interaction, or trigger cannot be found', () => {
    expect(
      planTriggerInputDeletion(undefined, 'interaction-2', 'trigger-single', 'interaction-1'),
    ).toBeUndefined();
    expect(
      planTriggerInputDeletion(story, 'missing', 'trigger-single', 'interaction-1'),
    ).toBeUndefined();
    expect(
      planTriggerInputDeletion(story, 'interaction-2', 'missing', 'interaction-1'),
    ).toBeUndefined();
  });
});
