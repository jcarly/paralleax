import { expect, it } from 'vitest';
import { deterministicTriggerRoll, getTriggerProbabilityResult } from './evaluation.js';
import { updateTriggerInStory } from '../operations/triggers.js';
import type { Story } from '../model/stories.js';

it('keeps the same roll when an imported Trigger receives a new id', () => {
  const context = { randomSeed: 'saved-seed', step: 3 };
  const source = { id: 'source-id', inputInteractionIds: [], appearanceProbability: 50 };
  const imported = { ...source, id: 'new-id', probabilityKey: source.id };
  expect(getTriggerProbabilityResult(imported, context)).toEqual(
    getTriggerProbabilityResult(source, context),
  );
  expect(getTriggerProbabilityResult(source, context).roll).toBe(
    deterministicTriggerRoll(context.randomSeed, context.step, source.id),
  );
});

it('keeps the stable probability identity when editing a Trigger', () => {
  const story: Story = {
    id: 'story',
    title: 'Story',
    createdAt: '',
    updatedAt: '',
    interactions: [
      {
        id: 'interaction',
        title: '',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'new-id', probabilityKey: 'source-id', inputInteractionIds: [] }],
      },
    ],
  };
  const updated = updateTriggerInStory(story, 'interaction', 'new-id', { timerSeconds: 5 });
  expect(updated.interactions[0].triggers[0]).toMatchObject({
    probabilityKey: 'source-id',
    timerSeconds: 5,
  });
});
