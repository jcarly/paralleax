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
  const summary = summarizeStoryChanges(before, after, createStoryChangeDelta(before, after), {
    refsById: new Map([['scene', 'sceneRef']]),
  });

  expect(summary.counts).toEqual({
    statDefinitionsAdded: 0,
    statDefinitionsUpdated: 0,
    statAssignmentsAdded: 0,
    statAssignmentsUpdated: 0,
    charactersAdded: 0,
    charactersUpdated: 0,
    locationsAdded: 0,
    locationsUpdated: 0,
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

const contextOperations: StoryChangeOperation[] = [
  { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
  { type: 'create_location', ref: 'station', fields: { name: 'Station' } },
  {
    type: 'create_interaction',
    ref: 'lab',
    inputInteractions: ['start'],
    fields: {
      title: 'Lab',
      locationId: { ref: 'station' },
      characterIds: ['existing-character', { ref: 'alya' }],
      conditionalTextBlocks: [{ conditions: [{ characterId: { ref: 'alya' }, isPresent: true }] }],
    },
    defaultTrigger: {
      conditionGroups: [
        {
          conditions: [
            { locationId: { ref: 'station' }, isCurrentLocation: true },
            { interactionId: 'start', hasBeenVisited: true },
          ],
        },
      ],
    },
  },
  { type: 'update_character', character: { ref: 'alya' }, fields: { isPlayable: true } },
  { type: 'update_location', location: 'existing-location', fields: { category: 'Hub' } },
];

it('resolves character and location references in fields and conditions', () => {
  const result = resolveStoryChangeOperations(contextOperations, sequence());

  expect(result.diagnostics).toEqual([]);
  expect(result.created.slice(0, 2)).toEqual([
    { kind: 'character', operationIndex: 0, id: 'id-1', ref: 'alya' },
    { kind: 'location', operationIndex: 1, id: 'id-2', ref: 'station' },
  ]);
  const lab = result.operations[2];
  expect(lab).toMatchObject({
    type: 'create_interaction',
    fields: { locationId: 'id-2', characterIds: ['existing-character', 'id-1'] },
    defaultTrigger: {
      conditionGroups: [
        {
          conditions: [
            { locationId: 'id-2', isCurrentLocation: true },
            { interactionId: 'start', hasBeenVisited: true },
          ],
        },
      ],
    },
  });
  expect(lab).toMatchObject({
    fields: {
      conditionalTextBlocks: [{ conditions: [{ characterId: 'id-1', isPresent: true }] }],
    },
  });
  expect(result.operations[3]).toEqual({
    type: 'update_character',
    index: 3,
    characterId: 'id-1',
    fields: { isPlayable: true },
  });
  expect(result.operations[4]).toMatchObject({
    type: 'update_location',
    locationId: 'existing-location',
  });
});

it('reports unknown, later, wrong-kind and duplicate context references', () => {
  const diagnostics = (operations: StoryChangeOperation[]) =>
    resolveStoryChangeOperations(operations, sequence()).diagnostics.map(
      ({ operationIndex, code, path }) => ({ operationIndex, code, path }),
    );

  expect(
    diagnostics([{ type: 'create_interaction', fields: { characterIds: [{ ref: 'nobody' }] } }]),
  ).toEqual([{ operationIndex: 0, code: 'UNKNOWN_REFERENCE', path: 'fields.characterIds.0' }]);
  expect(
    diagnostics([
      { type: 'create_interaction', fields: { locationId: { ref: 'later' } } },
      { type: 'create_location', ref: 'later', fields: { name: 'Later' } },
    ]),
  ).toEqual([{ operationIndex: 0, code: 'UNKNOWN_REFERENCE', path: 'fields.locationId' }]);
  expect(
    diagnostics([
      { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
      { type: 'update_location', location: { ref: 'alya' }, fields: { name: 'x' } },
      {
        type: 'create_trigger',
        interaction: 'start',
        fields: {
          conditionGroups: [
            { conditions: [{ locationId: { ref: 'alya' }, isCurrentLocation: true }] },
          ],
        },
      },
    ]),
  ).toEqual([
    { operationIndex: 1, code: 'REFERENCE_KIND_MISMATCH', path: 'location' },
    {
      operationIndex: 2,
      code: 'REFERENCE_KIND_MISMATCH',
      path: 'fields.conditionGroups.0.conditions.0.locationId',
    },
  ]);
  expect(
    diagnostics([
      { type: 'create_character', ref: 'same', fields: { name: 'A' } },
      { type: 'create_location', ref: 'same', fields: { name: 'B' } },
    ]),
  ).toEqual([{ operationIndex: 1, code: 'DUPLICATE_REFERENCE', path: 'ref' }]);
});

function contextStory(overrides: Partial<Story>): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    interactions: [],
    ...overrides,
  };
}

const contextBefore = contextStory({
  characters: [{ id: 'old', name: 'Old', description: '', isPlayable: true }],
});
const contextAfter = contextStory({
  characters: [
    { id: 'old', name: 'Old', description: '', isPlayable: false },
    { id: 'c-1', name: 'Alya', description: 'Engineer', isPlayable: true },
  ],
  locations: [{ id: 'l-1', name: 'Station', description: '', category: 'Hub' }],
  interactions: [
    {
      id: 'i-1',
      title: 'Lab',
      body: '',
      position: { x: 0, y: 0 },
      locationId: 'l-1',
      characterIds: ['c-1'],
      triggers: [],
    },
  ],
});

function contextSummary() {
  return summarizeStoryChanges(
    contextBefore,
    contextAfter,
    createStoryChangeDelta(contextBefore, contextAfter),
    {
      refsById: new Map([
        ['c-1', 'alya'],
        ['l-1', 'station'],
      ]),
      provisionalIds: true,
    },
  );
}

it('summarizes created and updated characters and locations', () => {
  const summary = contextSummary();

  expect(summary.provisionalIds).toBe(true);
  expect(summary.counts).toMatchObject({
    charactersAdded: 1,
    charactersUpdated: 1,
    locationsAdded: 1,
    locationsUpdated: 0,
  });
  expect(summary.characters).toEqual([
    {
      change: 'updated',
      id: 'old',
      name: 'Old',
      fields: [{ field: 'isPlayable', before: true, after: false }],
    },
    {
      change: 'added',
      id: 'c-1',
      ref: 'alya',
      name: 'Alya',
      fields: [
        { field: 'description', after: 'Engineer' },
        { field: 'isPlayable', after: true },
      ],
    },
  ]);
  expect(summary.locations).toEqual([
    {
      change: 'added',
      id: 'l-1',
      ref: 'station',
      name: 'Station',
      fields: [{ field: 'category', after: 'Hub' }],
    },
  ]);
  expect(summary.otherChangedFields).toEqual([]);
});

it('names the created entities that an interaction field refers to', () => {
  const [lab] = contextSummary().interactions;

  expect(lab.fields).toEqual(
    expect.arrayContaining([
      { field: 'locationId', after: 'l-1', references: [{ id: 'l-1', ref: 'station' }] },
      { field: 'characterIds', after: ['c-1'], references: [{ id: 'c-1', ref: 'alya' }] },
    ]),
  );
});
