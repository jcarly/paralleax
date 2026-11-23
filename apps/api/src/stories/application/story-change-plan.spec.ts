import type { Story } from '@paralleax/shared';
import { applyStoryChangePlan, planStoryChanges } from './story-change-plan';

function ids() {
  let next = 0;
  return () => `new-${++next}`;
}

function story(): Story {
  return {
    id: 'story',
    title: 'Story',
    revision: 4,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locations: [{ id: 'harbor', name: 'Harbor', description: '' }],
    interactions: [
      {
        id: 'start',
        title: 'Start',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'start-trigger', inputInteractionIds: [], conditionGroups: [] }],
      },
    ],
  };
}

it('applies created interactions, their default Triggers and later references in order', () => {
  const plan = planStoryChanges(
    [
      {
        type: 'create_interaction',
        ref: 'scene',
        inputInteractions: ['start'],
        fields: { title: 'Scene', body: '<p>Hi</p><script>x</script>', locationId: 'harbor' },
        defaultTrigger: { ref: 'sceneTrigger', appearanceProbability: 40 },
      },
      {
        type: 'create_trigger',
        interaction: 'start',
        inputInteractions: [{ ref: 'scene' }],
        fields: {
          conditionGroups: [
            { conditions: [{ interactionId: { ref: 'scene' }, hasBeenVisited: true }] },
          ],
        },
      },
      { type: 'update_interaction', interaction: { ref: 'scene' }, fields: { durationMinutes: 3 } },
    ],
    ids(),
  );
  expect(plan.diagnostics).toEqual([]);

  const applied = applyStoryChangePlan(story(), plan);

  expect(applied.diagnostics).toEqual([]);
  const scene = applied.story.interactions.find(({ id }) => id === 'new-1');
  expect(scene).toMatchObject({
    title: 'Scene',
    body: '<p>Hi</p>',
    locationId: 'harbor',
    durationMinutes: 3,
    triggers: [{ id: 'new-2', inputInteractionIds: ['start'], appearanceProbability: 40 }],
  });
  expect(applied.story.interactions[0].triggers[1]).toMatchObject({
    id: 'new-4',
    inputInteractionIds: ['new-1'],
    conditionGroups: [
      { id: 'new-3', conditions: [{ interactionId: 'new-1', hasBeenVisited: true }] },
    ],
  });
});

it('reports shape and field errors for every operation without applying any', () => {
  const plan = planStoryChanges(
    [
      { type: 'create_interaction', fields: { title: 'x'.repeat(201) } },
      { type: 'create_interaction', unknown: true },
      'not an operation',
    ],
    ids(),
  );
  expect(plan.steps).toEqual([]);
  expect(plan.diagnostics.map(({ operationIndex, code }) => [operationIndex, code])).toEqual([
    [1, 'UNKNOWN_FIELD'],
    [2, 'INVALID_OPERATION'],
  ]);

  const fieldErrors = planStoryChanges(
    [{ type: 'create_interaction', fields: { title: 'x'.repeat(201) } }],
    ids(),
  );
  expect(fieldErrors.diagnostics).toEqual([
    expect.objectContaining({ operationIndex: 0, code: 'INVALID_FIELD', path: 'fields.title' }),
  ]);
});

it('stops at the first operation that breaks an authoring rule', () => {
  const plan = planStoryChanges(
    [
      { type: 'create_interaction', ref: 'a', inputInteractions: ['start'] },
      { type: 'create_trigger', interaction: { ref: 'a' }, inputInteractions: ['start'] },
      { type: 'update_interaction', interaction: 'missing', fields: { title: 'x' } },
    ],
    ids(),
  );

  const applied = applyStoryChangePlan(story(), plan);

  expect(applied.diagnostics).toEqual([
    expect.objectContaining({ operationIndex: 1, code: 'TRIGGER_CONNECTION_EXISTS' }),
  ]);
});

it('warns about created interactions without a title or an input', () => {
  const plan = planStoryChanges([{ type: 'create_interaction' }], ids());
  const applied = applyStoryChangePlan(story(), plan);
  expect(applied.diagnostics.map(({ severity, code }) => [severity, code])).toEqual([
    ['warning', 'EMPTY_TITLE'],
    ['warning', 'NO_INPUT_INTERACTION'],
  ]);
});
