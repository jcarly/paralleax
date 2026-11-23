import type { Story, StoryChangeDiagnostic } from '@paralleax/shared';
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
    statDefinitions: [
      { id: 'def-flag', name: 'Alarm', valueType: 'boolean' },
      { id: 'def-text', name: 'Motto', valueType: 'string' },
    ],
    characters: [{ id: 'bruno', name: 'Bruno', description: '' }],
    locations: [{ id: 'harbor', name: 'Harbor', description: '' }],
    itemDefinitions: [{ id: 'lamp', name: 'Lamp', description: '' }],
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

const reserve = [
  {
    type: 'create_stat_definition',
    ref: 'reserveDef',
    fields: { name: ' Reserve ', valueType: 'number' },
  },
  {
    type: 'create_stat_assignment',
    ref: 'reserve',
    statDefinition: { ref: 'reserveDef' },
    owner: { type: 'story' },
    fields: { initialValue: 100 },
  },
];

function plan(operations: object[]) {
  return planStoryChanges(operations, ids());
}

function applyOperations(operations: object[], from = story()) {
  const planned = plan(operations);
  expect(planned.diagnostics).toEqual([]);
  return applyStoryChangePlan(from, planned);
}

function errorOf(operations: object[], from = story()) {
  const planned = plan(operations);
  const diagnostics: StoryChangeDiagnostic[] =
    planned.diagnostics.length > 0
      ? planned.diagnostics
      : applyStoryChangePlan(from, planned).diagnostics;
  return diagnostics.map(({ operationIndex, code, message }) => ({
    operationIndex,
    code,
    message,
  }));
}

it('creates a definition, assigns it to the Story and uses it in an effect and conditions', () => {
  const { story: result, diagnostics } = applyOperations([
    ...reserve,
    {
      type: 'create_interaction',
      ref: 'maintain',
      inputInteractions: ['start'],
      fields: {
        title: 'Maintain',
        statEffects: [{ statId: { ref: 'reserve' }, operation: 'add', value: -20 }],
      },
    },
    {
      type: 'create_interaction',
      inputInteractions: [{ ref: 'maintain' }],
      fields: { title: 'Backup' },
      defaultTrigger: {
        conditionGroups: [
          { conditions: [{ statId: { ref: 'reserve' }, operator: 'gte', value: 60 }] },
        ],
      },
    },
  ]);

  expect(diagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
  expect(result.statDefinitions?.at(-1)).toEqual({
    id: 'new-1',
    name: 'Reserve',
    valueType: 'number',
  });
  expect(result.stats).toEqual([{ id: 'new-2', statDefinitionId: 'new-1', initialValue: 100 }]);
  expect(result.interactions[1].statEffects).toEqual([
    { statId: 'new-2', operation: 'add', value: -20 },
  ]);
  expect(result.interactions[2].triggers[0].conditionGroups?.[0].conditions).toEqual([
    { statId: 'new-2', operator: 'gte', value: 60 },
  ]);
});

it('keeps two assignments of one definition independent across owners', () => {
  const { story: result } = applyOperations([
    ...reserve,
    {
      type: 'create_stat_assignment',
      ref: 'bruno',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'character', id: 'bruno' },
      fields: { initialValue: 7 },
    },
    {
      type: 'create_stat_assignment',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'location', id: 'harbor' },
      fields: { initialValue: 3 },
    },
    { type: 'update_stat_assignment', assignment: { ref: 'bruno' }, fields: { initialValue: 9 } },
  ]);

  expect(result.stats?.[0].initialValue).toBe(100);
  expect(result.characters?.[0].stats).toEqual([
    { id: 'new-3', statDefinitionId: 'new-1', initialValue: 9 },
  ]);
  expect(result.locations?.[0].stats?.[0]).toMatchObject({ initialValue: 3 });
});

it('assigns to a created character and to an existing item definition template', () => {
  const { story: result } = applyOperations([
    { type: 'create_character', ref: 'alya', fields: { name: 'Alya' } },
    ...reserve.slice(0, 1),
    {
      type: 'create_stat_assignment',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'character', id: { ref: 'alya' } },
      fields: { initialValue: 50 },
    },
    {
      type: 'create_stat_assignment',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'itemDefinition', id: 'lamp' },
      fields: { initialValue: 10 },
    },
  ]);

  expect(result.characters?.find(({ id }) => id === 'new-1')?.stats?.[0]).toMatchObject({
    initialValue: 50,
  });
  expect(result.itemDefinitions?.[0].stats?.[0]).toMatchObject({ initialValue: 10 });
});

it('updates a definition without changing its type and removes an hourly change with 0', () => {
  const { story: result } = applyOperations([
    {
      type: 'create_stat_definition',
      ref: 'drain',
      fields: { name: 'Drain', valueType: 'number', changePerHour: -2, category: 'Power' },
    },
    {
      type: 'update_stat_definition',
      statDefinition: { ref: 'drain' },
      fields: { name: 'Drain rate', changePerHour: 0, category: '' },
    },
  ]);

  expect(result.statDefinitions?.at(-1)).toEqual({
    id: 'new-1',
    name: 'Drain rate',
    valueType: 'number',
  });
});

it('requires an explicit value type and a typed initial value', () => {
  expect(errorOf([{ type: 'create_stat_definition', fields: { name: 'No type' } }])).toMatchObject([
    { operationIndex: 0, code: 'REQUIRED_FIELD' },
  ]);
  expect(
    errorOf([{ type: 'create_stat_definition', fields: { name: 'x', valueType: 'integer' } }]),
  ).toMatchObject([{ code: 'INVALID_FIELD' }]);
  expect(errorOf([reserve[0], { ...reserve[1], fields: { initialValue: 'a lot' } }])).toEqual([
    { operationIndex: 1, code: 'INVALID_OPERATION', message: 'Stat value must be a number' },
  ]);
  expect(
    errorOf([{ ...reserve[1], statDefinition: 'def-flag', fields: { initialValue: 1 } }]),
  ).toMatchObject([{ message: 'Stat value must be a boolean' }]);
  expect(errorOf([reserve[0], { ...reserve[1], fields: {} }])).toMatchObject([
    { code: 'INVALID_FIELD' },
  ]);
});

const messages = (operations: object[]) => errorOf(operations).map(({ message }) => message);
const flag = {
  statDefinition: 'def-flag',
  owner: { type: 'story' },
  fields: { initialValue: true },
};
const flagAssignment = { type: 'create_stat_assignment', ref: 'flag', ...flag };
const effectsOnStart = (statEffects: object[]) => ({
  type: 'update_interaction',
  interaction: 'start',
  fields: { statEffects },
});
const conditionOnStart = (condition: object) => ({
  type: 'create_trigger',
  interaction: 'start',
  fields: { conditionGroups: [{ conditions: [condition] }] },
});

it('assigns a definition at most once to one owner', () => {
  expect(messages([flagAssignment, { type: 'create_stat_assignment', ...flag }])).toEqual([
    'An owner can only assign a stat once',
  ]);
});

it('allows add effects on numbers only and one effect per target', () => {
  expect(
    messages([
      flagAssignment,
      effectsOnStart([{ statId: { ref: 'flag' }, operation: 'add', value: true }]),
    ]),
  ).toEqual(['Only numeric stats support add effects']);
  expect(
    messages([
      flagAssignment,
      effectsOnStart([
        { statId: { ref: 'flag' }, operation: 'set', value: false },
        { statId: { ref: 'flag' }, operation: 'set', value: true },
      ]),
    ]),
  ).toEqual(['An interaction can affect each stat target at most once']);
});

it('checks condition values and operators against the definition type', () => {
  expect(
    messages([
      ...reserve,
      conditionOnStart({ statId: { ref: 'reserve' }, operator: 'eq', value: 'x' }),
    ]),
  ).toEqual(['Stat value must be a number']);
  expect(
    messages([
      {
        type: 'create_stat_assignment',
        ref: 'word',
        statDefinition: 'def-text',
        owner: { type: 'story' },
        fields: { initialValue: 'hi' },
      },
      conditionOnStart({ statId: { ref: 'word' }, operator: 'gt', value: 'a' }),
    ]),
  ).toEqual(['Boolean and string stats only support equality checks']);
});

it('refuses an hourly change on a non-numeric definition', () => {
  expect(
    messages([
      {
        type: 'create_stat_definition',
        fields: { name: 'Word', valueType: 'string', changePerHour: 1 },
      },
    ]),
  ).toEqual(['Only numeric stats can change over time']);
});

it('compares two assignments of the same type', () => {
  const { story: result } = applyOperations([
    ...reserve,
    {
      type: 'create_stat_assignment',
      ref: 'bruno',
      statDefinition: { ref: 'reserveDef' },
      owner: { type: 'character', id: 'bruno' },
      fields: { initialValue: 7 },
    },
    {
      type: 'create_trigger',
      interaction: 'start',
      fields: {
        conditionGroups: [
          {
            conditions: [
              { statId: { ref: 'bruno' }, operator: 'lt', comparisonStatId: { ref: 'reserve' } },
            ],
          },
        ],
      },
    },
  ]);

  expect(result.interactions[0].triggers[1].conditionGroups?.[0].conditions[0]).toEqual({
    statId: 'new-3',
    operator: 'lt',
    comparisonStatId: 'new-2',
  });
});

it('refuses identifiers outside the Story and malformed owners', () => {
  expect(
    errorOf([{ ...reserve[1], statDefinition: 'other-story-definition' }]).map(({ code }) => code),
  ).toEqual(['REFERENCE_NOT_FOUND']);
  expect(
    errorOf([
      {
        ...reserve[1],
        statDefinition: 'def-flag',
        owner: { type: 'character', id: 'elsewhere' },
        fields: { initialValue: true },
      },
    ]),
  ).toEqual([
    {
      operationIndex: 0,
      code: 'INVALID_OPERATION',
      message: 'Stat owner must belong to the same story',
    },
  ]);
  expect(
    errorOf([
      { type: 'update_stat_assignment', assignment: 'elsewhere', fields: { initialValue: 1 } },
    ]).map(({ code }) => code),
  ).toEqual(['REFERENCE_NOT_FOUND']);
  expect(
    errorOf([
      { ...reserve[1], statDefinition: 'def-flag', owner: { type: 'story', id: 'x' } },
      { ...reserve[1], statDefinition: 'def-flag', owner: { type: 'character' } },
      {
        ...reserve[1],
        statDefinition: 'def-flag',
        owner: { type: 'itemDefinition', id: { ref: 'a' } },
      },
      { ...reserve[1], statDefinition: 'def-flag', owner: { type: 'team', id: 'x' } },
      { ...reserve[1], statDefinition: 'def-flag', owner: undefined },
    ]).map(({ operationIndex, code }) => `${operationIndex}:${code}`),
  ).toEqual([
    '0:INVALID_FIELD',
    '1:REQUIRED_FIELD',
    '2:INVALID_REFERENCE',
    '3:INVALID_FIELD',
    '4:INVALID_FIELD',
  ]);
});

it('refuses unknown fields on stat operations', () => {
  const codes = (operation: object) => errorOf([operation]).map(({ code }) => code);

  expect(
    codes({
      type: 'update_stat_definition',
      statDefinition: 'def-flag',
      fields: { valueType: 'number' },
    }),
  ).toEqual(['INVALID_FIELD']);
  expect(
    codes({
      type: 'update_stat_assignment',
      assignment: 'a',
      fields: { initialValue: 1, ownerType: 'story' },
    }),
  ).toEqual(['INVALID_FIELD']);
  expect(
    codes({
      type: 'create_stat_definition',
      fields: { name: 'x', valueType: 'number' },
      extra: true,
    }),
  ).toEqual(['UNKNOWN_FIELD']);
});
