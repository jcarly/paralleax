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

function diagnosticsOf(operations: StoryChangeOperation[]) {
  return resolveStoryChangeOperations(operations, sequence()).diagnostics.map(
    ({ operationIndex, code, path }) => ({ operationIndex, code, path }),
  );
}

const statOperations: StoryChangeOperation[] = [
  {
    type: 'create_stat_definition',
    ref: 'reserveDef',
    fields: { name: 'Reserve', valueType: 'number' },
  },
  {
    type: 'create_stat_assignment',
    ref: 'reserve',
    statDefinition: { ref: 'reserveDef' },
    owner: { type: 'story' },
    fields: { initialValue: 100 },
  },
  { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
  {
    type: 'create_stat_assignment',
    ref: 'calm',
    statDefinition: { ref: 'reserveDef' },
    owner: { type: 'character', id: { ref: 'alya' } },
    fields: { initialValue: 50 },
  },
  {
    type: 'create_interaction',
    ref: 'maintain',
    inputInteractions: ['start'],
    fields: { statEffects: [{ statId: { ref: 'reserve' }, operation: 'add', value: -20 }] },
    defaultTrigger: {
      conditionGroups: [
        {
          conditions: [
            { statId: { ref: 'reserve' }, operator: 'gte', value: 60 },
            { statId: { ref: 'calm' }, operator: 'lt', comparisonStatId: { ref: 'reserve' } },
            { statId: 'existing-assignment', operator: 'eq', value: 1 },
          ],
        },
      ],
    },
  },
  {
    type: 'update_stat_assignment',
    assignment: { ref: 'calm' },
    fields: { initialValue: 55 },
  },
];

it('resolves definition, assignment and owner references in order', () => {
  const result = resolveStoryChangeOperations(statOperations, sequence());

  expect(result.diagnostics).toEqual([]);
  expect(result.created.slice(0, 4)).toEqual([
    { kind: 'statDefinition', operationIndex: 0, id: 'id-1', ref: 'reserveDef' },
    { kind: 'statAssignment', operationIndex: 1, id: 'id-2', ref: 'reserve' },
    { kind: 'character', operationIndex: 2, id: 'id-3', ref: 'alya' },
    { kind: 'statAssignment', operationIndex: 3, id: 'id-4', ref: 'calm' },
  ]);
  expect(result.operations[1]).toEqual({
    type: 'create_stat_assignment',
    index: 1,
    assignmentId: 'id-2',
    statDefinitionId: 'id-1',
    ownerType: 'story',
    fields: { initialValue: 100 },
  });
  expect(result.operations[3]).toMatchObject({
    ownerType: 'character',
    ownerId: 'id-3',
    statDefinitionId: 'id-1',
  });
  expect(result.operations[4]).toMatchObject({
    fields: { statEffects: [{ statId: 'id-2', operation: 'add', value: -20 }] },
    defaultTrigger: {
      conditionGroups: [
        {
          conditions: [
            { statId: 'id-2', operator: 'gte', value: 60 },
            { statId: 'id-4', operator: 'lt', comparisonStatId: 'id-2' },
            { statId: 'existing-assignment', operator: 'eq', value: 1 },
          ],
        },
      ],
    },
  });
  expect(result.operations[5]).toMatchObject({ assignmentId: 'id-4' });
});

it('resolves stat references in conditional text blocks', () => {
  const result = resolveStoryChangeOperations(
    [
      statOperations[0],
      statOperations[1],
      {
        type: 'update_interaction',
        interaction: 'start',
        fields: {
          conditionalTextBlocks: [
            { conditions: [{ statId: { ref: 'reserve' }, operator: 'lt', value: 60 }] },
          ],
        },
      },
    ],
    sequence(),
  );

  expect(result.diagnostics).toEqual([]);
  expect(result.operations[2]).toMatchObject({
    fields: { conditionalTextBlocks: [{ conditions: [{ statId: 'id-2' }] }] },
  });
});

const definitionAndAssignment = [statOperations[0], statOperations[1]];

it('never takes a definition reference for an assignment in effects and conditions', () => {
  expect(
    diagnosticsOf([
      ...definitionAndAssignment,
      {
        type: 'update_interaction',
        interaction: 'start',
        fields: { statEffects: [{ statId: { ref: 'reserveDef' }, operation: 'set', value: 1 }] },
      },
      {
        type: 'create_trigger',
        interaction: 'start',
        fields: {
          conditionGroups: [
            { conditions: [{ statId: { ref: 'reserveDef' }, operator: 'eq', value: 1 }] },
            {
              conditions: [
                {
                  statId: { ref: 'reserve' },
                  operator: 'eq',
                  comparisonStatId: { ref: 'reserveDef' },
                },
              ],
            },
          ],
        },
      },
    ]),
  ).toEqual([
    { operationIndex: 2, code: 'REFERENCE_KIND_MISMATCH', path: 'fields.statEffects.0.statId' },
    {
      operationIndex: 3,
      code: 'REFERENCE_KIND_MISMATCH',
      path: 'fields.conditionGroups.0.conditions.0.statId',
    },
    {
      operationIndex: 3,
      code: 'REFERENCE_KIND_MISMATCH',
      path: 'fields.conditionGroups.1.conditions.0.comparisonStatId',
    },
  ]);
});

it('never takes an assignment reference for a definition, or the reverse, in operations', () => {
  expect(
    diagnosticsOf([
      ...definitionAndAssignment,
      {
        type: 'create_stat_assignment',
        statDefinition: { ref: 'reserve' },
        owner: { type: 'story' },
        fields: { initialValue: 1 },
      },
      {
        type: 'update_stat_assignment',
        assignment: { ref: 'reserveDef' },
        fields: { initialValue: 1 },
      },
      { type: 'update_stat_definition', statDefinition: { ref: 'reserve' }, fields: { name: 'x' } },
    ]),
  ).toEqual([
    { operationIndex: 2, code: 'REFERENCE_KIND_MISMATCH', path: 'statDefinition' },
    { operationIndex: 3, code: 'REFERENCE_KIND_MISMATCH', path: 'assignment' },
    { operationIndex: 4, code: 'REFERENCE_KIND_MISMATCH', path: 'statDefinition' },
  ]);
});

it('rejects unknown, later, duplicate and wrong-owner stat references', () => {
  expect(
    diagnosticsOf([
      {
        type: 'create_stat_assignment',
        ref: 'early',
        statDefinition: { ref: 'later' },
        owner: { type: 'character', id: { ref: 'nobody' } },
        fields: { initialValue: 1 },
      },
      { type: 'create_stat_definition', ref: 'later', fields: { name: 'L', valueType: 'string' } },
      { type: 'create_stat_definition', ref: 'later', fields: { name: 'M', valueType: 'string' } },
      { type: 'create_location', ref: 'place', fields: { name: 'Place' } },
      {
        type: 'create_stat_assignment',
        statDefinition: { ref: 'later' },
        owner: { type: 'character', id: { ref: 'place' } },
        fields: { initialValue: 'x' },
      },
    ]),
  ).toEqual([
    { operationIndex: 0, code: 'UNKNOWN_REFERENCE', path: 'statDefinition' },
    { operationIndex: 0, code: 'UNKNOWN_REFERENCE', path: 'owner.id' },
    { operationIndex: 2, code: 'DUPLICATE_REFERENCE', path: 'ref' },
    { operationIndex: 4, code: 'REFERENCE_KIND_MISMATCH', path: 'owner.id' },
  ]);
});

it('keeps existing IDs for item definition owners and existing assignments', () => {
  const result = resolveStoryChangeOperations(
    [
      {
        type: 'create_stat_assignment',
        statDefinition: 'existing-definition',
        owner: { type: 'itemDefinition', id: 'existing-item' },
        fields: { initialValue: true },
      },
      {
        type: 'update_stat_assignment',
        assignment: 'existing-assignment',
        fields: { initialValue: false },
      },
    ],
    sequence(),
  );

  expect(result.diagnostics).toEqual([]);
  expect(result.operations[0]).toMatchObject({
    statDefinitionId: 'existing-definition',
    ownerType: 'itemDefinition',
    ownerId: 'existing-item',
  });
  expect(result.operations[1]).toMatchObject({ assignmentId: 'existing-assignment' });
});

function statStory(overrides: Partial<Story>): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    interactions: [],
    ...overrides,
  };
}

const statsBefore = statStory({
  statDefinitions: [{ id: 'd-0', name: 'Old', valueType: 'string' }],
  characters: [
    {
      id: 'c-0',
      name: 'Old',
      description: '',
      stats: [{ id: 'a-0', statDefinitionId: 'd-0', initialValue: 'a' }],
    },
  ],
  itemDefinitions: [{ id: 'item-0', name: 'Lamp', description: '' }],
});
const statsAfter = statStory({
  statDefinitions: [
    { id: 'd-0', name: 'Old', valueType: 'string' },
    { id: 'd-1', name: 'Reserve', valueType: 'number' },
  ],
  stats: [{ id: 'a-1', statDefinitionId: 'd-1', initialValue: 100 }],
  characters: [
    {
      id: 'c-0',
      name: 'Old',
      description: '',
      stats: [{ id: 'a-0', statDefinitionId: 'd-0', initialValue: 'b' }],
    },
    {
      id: 'c-1',
      name: 'Alya',
      description: '',
      stats: [{ id: 'a-2', statDefinitionId: 'd-1', initialValue: 0 }],
    },
  ],
  itemDefinitions: [
    {
      id: 'item-0',
      name: 'Lamp',
      description: '',
      stats: [{ id: 'a-3', statDefinitionId: 'd-1', initialValue: 5 }],
    },
  ],
});

function statsSummary() {
  return summarizeStoryChanges(
    statsBefore,
    statsAfter,
    createStoryChangeDelta(statsBefore, statsAfter),
    {
      refsById: new Map([
        ['d-1', 'reserveDef'],
        ['a-1', 'reserve'],
        ['c-1', 'alya'],
        ['a-2', 'calm'],
      ]),
      provisionalIds: true,
    },
  );
}

it('counts and lists the definitions and leaves no stat field unreported', () => {
  const summary = statsSummary();

  expect(summary.otherChangedFields).toEqual([]);
  expect(summary.counts).toMatchObject({
    statDefinitionsAdded: 1,
    statDefinitionsUpdated: 0,
    statAssignmentsAdded: 3,
    statAssignmentsUpdated: 1,
    charactersAdded: 1,
    charactersUpdated: 0,
  });
  expect(summary.statDefinitions).toEqual([
    {
      change: 'added',
      id: 'd-1',
      ref: 'reserveDef',
      name: 'Reserve',
      valueType: 'number',
      fields: [],
    },
  ]);
});

it('lists every assignment whoever owns it, once, with definition and owner', () => {
  const summary = statsSummary();

  const byId = Object.fromEntries(summary.statAssignments.map((item) => [item.id, item]));
  expect(byId['a-1']).toMatchObject({
    change: 'added',
    ref: 'reserve',
    definition: { id: 'd-1', ref: 'reserveDef', name: 'Reserve', valueType: 'number' },
    owner: { type: 'story' },
    fields: [{ field: 'initialValue', after: 100 }],
  });
  // An initial value of zero is still listed.
  expect(byId['a-2']).toMatchObject({
    owner: { type: 'character', id: 'c-1', ref: 'alya', name: 'Alya' },
    fields: [{ field: 'initialValue', after: 0 }],
  });
  expect(byId['a-0']).toMatchObject({
    change: 'updated',
    owner: { type: 'character', id: 'c-0', name: 'Old' },
    fields: [{ field: 'initialValue', before: 'a', after: 'b' }],
  });
  expect(byId['a-3']).toMatchObject({ owner: { type: 'itemDefinition', id: 'item-0' } });
  // The stats are not repeated as raw fields of their owners, nor left unreported.
  expect(summary.characters.map(({ id, fields }) => ({ id, fields }))).toEqual([
    { id: 'c-1', fields: [] },
  ]);
});
