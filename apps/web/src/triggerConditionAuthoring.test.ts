import { expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { createTriggerCondition } from './triggerConditionAuthoring';

it('returns no stat condition when the story has no stat targets', () => {
  const story = {
    id: 'story-1',
    title: 'Story',
    startDateTime: '2026-07-27T09:30',
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    interactions: [],
  } satisfies Story;

  expect(createTriggerCondition(story, 'interaction-1', 'stat')).toBeUndefined();
});
