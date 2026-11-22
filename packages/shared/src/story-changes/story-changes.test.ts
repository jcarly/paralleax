import { expect, it } from 'vitest';
import { createStoryChangeDelta } from '../history/story-history.js';
import type { Story } from '../model/stories.js';
import type { StoryChangeOperation } from './contract.js';
import { resolveStoryChangeOperations } from './references.js';
import { summarizeStoryChanges } from './summary.js';

function sequence() {
  let next = 0;
  return () => `id-${++next}`;
}

const sceneWithBranches: StoryChangeOperation[] = [
  {
    type: 'create_interaction',
    ref: 'scene',
    inputInteractions: ['start'],
    fields: { title: 'Scene' },
  },
  {
    type: 'create_interaction',
    ref: 'left',
    inputInteractions: [{ ref: 'scene' }],
    fields: { title: 'Left' },
    defaultTrigger: { ref: 'leftChoice' },
  },
  { type: 'create_interaction', ref: 'right', inputInteractions: [{ ref: 'scene' }] },
  {
    type: 'update_trigger',
    trigger: { ref: 'leftChoice' },
    fields: {
      conditionGroups: [
        { conditions: [{ interactionId: { ref: 'scene' }, hasBeenVisited: true }] },
      ],
    },
  },
];

it('resolves earlier references and generates IDs in operation order', () => {
  const result = resolveStoryChangeOperations(sceneWithBranches, sequence());

  expect(result.diagnostics).toEqual([]);
  expect(result.created).toEqual([
    { kind: 'interaction', operationIndex: 0, id: 'id-1', ref: 'scene' },
    { kind: 'trigger', operationIndex: 0, id: 'id-2', interactionId: 'id-1' },
    { kind: 'interaction', operationIndex: 1, id: 'id-3', ref: 'left' },
    { kind: 'trigger', operationIndex: 1, id: 'id-4', ref: 'leftChoice', interactionId: 'id-3' },
    { kind: 'interaction', operationIndex: 2, id: 'id-5', ref: 'right' },
    { kind: 'trigger', operationIndex: 2, id: 'id-6', interactionId: 'id-5' },
  ]);
  expect(result.operations[1]).toMatchObject({
    type: 'create_interaction',
    interactionId: 'id-3',
    triggerId: 'id-4',
    inputInteractionIds: ['id-1'],
  });
  expect(result.operations[3]).toEqual({
    type: 'update_trigger',
    index: 3,
    interactionId: 'id-3',
    triggerId: 'id-4',
    fields: {
      conditionGroups: [
        { id: 'id-7', conditions: [{ interactionId: 'id-1', hasBeenVisited: true }] },
      ],
    },
  });
});

it('is deterministic for the same operations and ID sequence', () => {
  expect(resolveStoryChangeOperations(sceneWithBranches, sequence())).toEqual(
    resolveStoryChangeOperations(sceneWithBranches, sequence()),
  );
});

it('rejects forward, own, unknown, duplicate and mistyped references', () => {
  const result = resolveStoryChangeOperations(
    [
      { type: 'create_interaction', ref: 'a', inputInteractions: [{ ref: 'b' }] },
      { type: 'create_interaction', ref: 'b', inputInteractions: [{ ref: 'b' }] },
      { type: 'create_interaction', ref: 'c' },
      { type: 'create_interaction', ref: 'c' },
      { type: 'update_interaction', interaction: { ref: 'cTrigger' }, fields: {} },
      { type: 'create_trigger', ref: 'cTrigger', interaction: { ref: 'c' } },
      { type: 'update_interaction', interaction: { ref: 'cTrigger' }, fields: {} },
      { type: 'create_interaction', ref: '1bad' },
      { type: 'update_trigger', trigger: 'existing-trigger' },
    ],
    sequence(),
  );

  expect(result.diagnostics.map(({ operationIndex, code }) => [operationIndex, code])).toEqual([
    [0, 'UNKNOWN_REFERENCE'],
    [1, 'UNKNOWN_REFERENCE'],
    [3, 'DUPLICATE_REFERENCE'],
    [4, 'UNKNOWN_REFERENCE'],
    [6, 'REFERENCE_KIND_MISMATCH'],
    [7, 'INVALID_REFERENCE'],
    [8, 'TRIGGER_OWNER_REQUIRED'],
  ]);
  expect(result.operations.map(({ index }) => index)).toEqual([2, 5]);
});

it('refuses a Trigger reference given with another owner', () => {
  const result = resolveStoryChangeOperations(
    [
      { type: 'create_interaction', ref: 'a', defaultTrigger: { ref: 'aTrigger' } },
      { type: 'create_interaction', ref: 'b' },
      { type: 'update_trigger', interaction: { ref: 'b' }, trigger: { ref: 'aTrigger' } },
    ],
    sequence(),
  );
  expect(result.diagnostics).toMatchObject([
    { operationIndex: 2, code: 'TRIGGER_OWNER_MISMATCH', path: 'trigger' },
  ]);
});

const before: Story = {
  id: 'story',
  title: 'Story',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  interactions: [
    {
      id: 'start',
      title: 'Start',
      body: '<p>Hello</p>',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'start-trigger', inputInteractionIds: [], conditionGroups: [] }],
    },
  ],
};

function storyWithScene(): Story {
  const after = structuredClone(before);
  after.interactions[0].title = 'Opening';
  after.interactions[0].body = 'x'.repeat(2_100);
  after.interactions.push({
    id: 'scene',
    title: 'Scene',
    body: '<p>A signal arrives.</p>',
    position: { x: 10, y: 10 },
    statEffects: [{ statId: 'courage', operation: 'add', value: 1 }],
    characterIds: [],
    triggers: [
      {
        id: 'scene-trigger',
        inputInteractionIds: ['start'],
        conditionGroups: [
          { id: 'group', conditions: [{ interactionId: 'start', hasBeenVisited: true }] },
        ],
        appearanceProbability: 60,
        timerSeconds: 30,
      },
    ],
  });
  return after;
}

it('counts added and updated entities and lists their values', () => {
  const after = storyWithScene();
  const summary = summarizeStoryChanges(
    before,
    after,
    createStoryChangeDelta(before, after),
    new Map([['scene', 'sceneRef']]),
  );

  expect(summary.counts).toEqual({
    interactionsAdded: 1,
    interactionsUpdated: 1,
    triggersAdded: 1,
    triggersUpdated: 0,
    connectionsAdded: 1,
    connectionsRemoved: 0,
  });
  expect(summary.interactions).toEqual([
    {
      change: 'updated',
      id: 'start',
      title: 'Opening',
      fields: [
        { field: 'title', before: 'Start', after: 'Opening' },
        {
          field: 'body',
          before: '<p>Hello</p>',
          after: `${'x'.repeat(2_000)}…`,
          truncated: true,
        },
      ],
    },
    {
      change: 'added',
      id: 'scene',
      ref: 'sceneRef',
      title: 'Scene',
      fields: [
        { field: 'body', after: '<p>A signal arrives.</p>' },
        { field: 'position', after: { x: 10, y: 10 } },
        { field: 'statEffects', after: [{ statId: 'courage', operation: 'add', value: 1 }] },
      ],
    },
  ]);
});

it('lists the Triggers and connections of an added interaction', () => {
  const after = storyWithScene();
  const summary = summarizeStoryChanges(before, after, createStoryChangeDelta(before, after));
  expect(summary.triggers).toEqual([
    {
      change: 'added',
      id: 'scene-trigger',
      interactionId: 'scene',
      inputInteractionIds: ['start'],
      conditionCount: 1,
      fields: expect.arrayContaining([
        {
          field: 'conditionGroups',
          after: [{ id: 'group', conditions: [{ interactionId: 'start', hasBeenVisited: true }] }],
        },
        { field: 'appearanceProbability', after: 60 },
        { field: 'timerSeconds', after: 30 },
      ]) as unknown,
    },
  ]);
  expect(summary.connections).toEqual([
    {
      change: 'added',
      triggerId: 'scene-trigger',
      sourceInteractionId: 'start',
      targetInteractionId: 'scene',
    },
  ]);
  expect(summary.otherChangedFields).toEqual([]);
});

it('lists every field of a Trigger added to an existing interaction, with truncation', () => {
  const after = structuredClone(before);
  const conditions = Array.from({ length: 200 }, (_, index) => ({
    interactionId: `interaction-${index}`,
    hasBeenVisited: true,
  }));
  after.interactions[0].triggers.push({
    id: 'new-trigger',
    inputInteractionIds: ['start'],
    conditionGroups: [{ id: 'many', conditions }],
    appearanceProbability: 25,
  });

  const summary = summarizeStoryChanges(before, after, createStoryChangeDelta(before, after));

  expect(summary.triggers.map(({ change, id }) => [change, id])).toEqual([
    ['added', 'new-trigger'],
  ]);
  expect(summary.triggers[0].fields).toContainEqual({ field: 'appearanceProbability', after: 25 });
  expect(summary.triggers[0].fields).toContainEqual({
    field: 'conditionGroups',
    after: { omitted: true, serializedLength: expect.any(Number) as unknown },
    truncated: true,
  });
});

it('reports updated Trigger fields and removed connections', () => {
  const after = structuredClone(before);
  after.interactions.push({
    id: 'other',
    title: 'Other',
    body: '',
    position: { x: 0, y: 0 },
    triggers: [{ id: 'other-trigger', inputInteractionIds: [], conditionGroups: [] }],
  });
  const middle = structuredClone(after);
  middle.interactions[1].triggers[0].inputInteractionIds = ['start'];
  const final = structuredClone(middle);
  final.interactions[1].triggers[0].inputInteractionIds = [];
  final.interactions[1].triggers[0].appearanceProbability = 50;

  const summary = summarizeStoryChanges(middle, final, createStoryChangeDelta(middle, final));

  expect(summary.interactions).toEqual([]);
  expect(summary.triggers.map(({ change, id }) => [change, id])).toEqual([
    ['updated', 'other-trigger'],
  ]);
  expect(summary.triggers[0].fields).toContainEqual({
    field: 'inputInteractionIds',
    before: ['start'],
    after: [],
  });
  expect(summary.connections).toEqual([
    {
      change: 'removed',
      triggerId: 'other-trigger',
      sourceInteractionId: 'start',
      targetInteractionId: 'other',
    },
  ]);
});
