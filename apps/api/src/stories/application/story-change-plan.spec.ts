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

const contextOperations = [
  {
    type: 'create_character',
    ref: 'alya',
    fields: { name: '  Alya  ', category: ' Crew ', isPlayable: true },
  },
  { type: 'create_location', ref: 'station', fields: { name: 'Station' } },
  {
    type: 'create_interaction',
    inputInteractions: ['start'],
    fields: {
      title: 'Lab',
      locationId: { ref: 'station' },
      characterIds: [{ ref: 'alya' }, { ref: 'alya' }],
    },
    defaultTrigger: {
      conditionGroups: [{ conditions: [{ characterId: { ref: 'alya' }, isPresent: true }] }],
    },
  },
  { type: 'update_location', location: { ref: 'station' }, fields: { category: 'Hub' } },
  { type: 'update_character', character: 'hero', fields: { description: 'Brave' } },
];

function appliedContext() {
  const base = story();
  base.characters = [{ id: 'hero', name: 'Hero', description: '', isPlayable: true, stats: [] }];
  const plan = planStoryChanges(contextOperations, ids());
  return { plan, applied: applyStoryChangePlan(base, plan) };
}

it('plans characters and locations with provisional IDs in operation order', () => {
  const { plan } = appliedContext();

  expect(plan.diagnostics).toEqual([]);
  expect(plan.created.slice(0, 2)).toEqual([
    { kind: 'character', operationIndex: 0, id: 'new-1', ref: 'alya' },
    { kind: 'location', operationIndex: 1, id: 'new-2', ref: 'station' },
  ]);
});

it('applies characters and locations with the editor defaults and the playable rule', () => {
  const { applied } = appliedContext();

  expect(applied.diagnostics.map(({ code }) => code)).toEqual([]);
  expect(applied.story.characters).toEqual([
    { id: 'hero', name: 'Hero', description: 'Brave', isPlayable: false, stats: [] },
    {
      id: 'new-1',
      name: 'Alya',
      description: '',
      category: 'Crew',
      imageUrl: '',
      isPlayable: true,
      stats: [],
    },
  ]);
  expect(applied.story.locations).toEqual([
    { id: 'harbor', name: 'Harbor', description: '' },
    { id: 'new-2', name: 'Station', description: '', imageUrl: '', category: 'Hub' },
  ]);
});

it('uses created characters and locations in interactions and conditions', () => {
  const { applied } = appliedContext();

  const lab = applied.story.interactions.find(({ title }) => title === 'Lab');
  expect(lab).toMatchObject({ locationId: 'new-2', characterIds: ['new-1'] });
  expect(lab?.triggers[0]).toMatchObject({
    conditionGroups: [{ conditions: [{ characterId: 'new-1', isPresent: true }] }],
  });
});

it('refuses entities outside the Story and invalid context fields', () => {
  const unknown = applyStoryChangePlan(
    story(),
    planStoryChanges(
      [{ type: 'create_interaction', fields: { title: 'x', characterIds: ['nobody'] } }],
      ids(),
    ),
  );
  expect(unknown.diagnostics).toEqual([
    expect.objectContaining({ operationIndex: 0, code: 'INVALID_OPERATION' }),
  ]);
  const missing = applyStoryChangePlan(
    story(),
    planStoryChanges(
      [{ type: 'update_character', character: 'nobody', fields: { name: 'x' } }],
      ids(),
    ),
  );
  expect(missing.diagnostics).toEqual([
    expect.objectContaining({ operationIndex: 0, code: 'REFERENCE_NOT_FOUND' }),
  ]);
  const invalid = planStoryChanges(
    [
      { type: 'create_location', fields: { name: '' } },
      { type: 'create_character', fields: { name: 'A', imageUrl: 'x'.repeat(2049) } },
    ],
    ids(),
  );
  expect(invalid.steps).toEqual([]);
  expect(new Set(invalid.diagnostics.map(({ operationIndex }) => operationIndex))).toEqual(
    new Set([0, 1]),
  );
  const shape = planStoryChanges(
    [
      { type: 'create_character' },
      { type: 'update_location', fields: {} },
      { type: 'create_location', fields: { name: 'A' }, location: 'x' },
    ],
    ids(),
  );
  expect(shape.diagnostics.map(({ operationIndex, code }) => [operationIndex, code])).toEqual([
    [0, 'INVALID_FIELD'],
    [1, 'REQUIRED_FIELD'],
    [2, 'UNKNOWN_FIELD'],
  ]);
});
