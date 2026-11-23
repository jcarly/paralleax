import { expect, it } from 'vitest';
import { apiError, connectPerTest, stubFetch, type RouteResponse } from './test/fake-api.js';

const connect = connectPerTest();
const storyId = '55555555-5555-4555-8555-555555555555';
const base = `/stories/${storyId}/changes`;
const proposalId = 'a'.repeat(64);
const operations = [
  {
    type: 'create_interaction',
    ref: 'scene',
    inputInteractions: ['start'],
    fields: { title: 'S' },
  },
  {
    type: 'update_trigger',
    interaction: { ref: 'scene' },
    trigger: 'existing-trigger',
    fields: {
      conditionGroups: [
        { conditions: [{ interactionId: { ref: 'scene' }, hasBeenVisited: true }] },
      ],
    },
  },
];

const validPreviewBody = {
  storyId,
  baseRevision: 7,
  valid: true,
  proposalId,
  operationCount: 2,
  createdEntities: [{ kind: 'interaction', operationIndex: 0, id: 'provisional', ref: 'scene' }],
  summary: {
    counts: { interactionsAdded: 1 },
    interactions: [],
    triggers: [],
    statDefinitions: [],
    statAssignments: [],
    connections: [],
  },
  diagnostics: [],
};
const validPreview: RouteResponse = { body: validPreviewBody };

const committedBody = {
  status: 'committed',
  storyId,
  proposalId,
  baseRevision: 7,
  revision: 8,
  createdEntities: [{ kind: 'interaction', operationIndex: 0, id: 'final', ref: 'scene' }],
};
const committed: RouteResponse = { body: committedBody };

it('previews a batch and asks for confirmation before committing', async () => {
  const api = stubFetch({ [`POST ${base}/preview`]: validPreview });
  const { call } = await connect(api.fetchImpl);

  const result = await call('preview_story_changes', { storyId, operations, expectedRevision: 7 });

  expect(result.isError).toBe(false);
  expect(result.data).toMatchObject({
    valid: true,
    proposalId,
    baseRevision: 7,
    idsAreProvisional: true,
    nextStep: expect.stringContaining('explicitly confirms') as unknown,
  });
  expect(api.requests).toEqual([
    expect.objectContaining({
      method: 'POST',
      path: `${base}/preview`,
      body: { version: 1, baseRevision: 7, operations },
    }),
  ]);
});

it('commits by naming the stored proposal only', async () => {
  const api = stubFetch({
    [`POST ${base}/preview`]: validPreview,
    [`POST ${base}/commit`]: committed,
  });
  const { call } = await connect(api.fetchImpl);
  await call('preview_story_changes', { storyId, operations });

  const result = await call('commit_story_changes', { storyId, proposalId });

  expect(result.data).toMatchObject({ status: 'committed', revision: 8 });
  expect(api.requests[1]).toMatchObject({
    path: `${base}/commit`,
    body: { version: 1, proposalId },
  });
});

it('reports an invalid preview and relays an unknown proposal from the API', async () => {
  const invalid: RouteResponse = {
    body: {
      ...validPreviewBody,
      valid: false,
      proposalId: undefined,
      diagnostics: [
        { severity: 'error', operationIndex: 0, code: 'UNKNOWN_REFERENCE', message: 'x' },
      ],
    },
  };
  const api = stubFetch({
    [`POST ${base}/preview`]: invalid,
    [`POST ${base}/commit`]: apiError(404, 'STORY_CHANGE_PROPOSAL_NOT_FOUND'),
  });
  const { call } = await connect(api.fetchImpl);

  const preview = await call('preview_story_changes', { storyId, operations });
  const commit = await call('commit_story_changes', { storyId, proposalId });

  expect(preview.data).toMatchObject({
    valid: false,
    nextStep: expect.stringContaining('Fix') as unknown,
  });
  expect(commit.data).toMatchObject({
    error: {
      code: 'STORY_CHANGE_PROPOSAL_NOT_FOUND',
      status: 404,
      hint: expect.stringContaining('Preview the batch again') as unknown,
    },
  });
});

it('maps stale revisions and unknown commit outcomes to actionable errors', async () => {
  let attempt = 0;
  const api = stubFetch({
    [`POST ${base}/preview`]: validPreview,
    [`POST ${base}/commit`]: () => {
      attempt += 1;
      return attempt === 1
        ? apiError(409, 'STORY_REVISION_CONFLICT')
        : { body: { ...committedBody, status: 'already_applied', reverted: false } };
    },
  });
  const { call } = await connect(api.fetchImpl);
  await call('preview_story_changes', { storyId, operations });

  const conflict = await call('commit_story_changes', { storyId, proposalId });
  const retry = await call('commit_story_changes', { storyId, proposalId });

  expect(conflict.data).toMatchObject({
    error: {
      code: 'STORY_REVISION_CONFLICT',
      status: 409,
      hint: expect.stringContaining('Read it again') as unknown,
    },
  });
  expect(retry.data).toMatchObject({ status: 'already_applied', revision: 8 });
});

it('reports a commit timeout as an unknown outcome that is safe to retry', async () => {
  const api = stubFetch({ [`POST ${base}/preview`]: validPreview });
  const { call } = await connect((input, init) => {
    if (input.endsWith('/commit')) {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    }
    return api.fetchImpl(input, init);
  });
  await call('preview_story_changes', { storyId, operations });

  const result = await call('commit_story_changes', { storyId, proposalId });

  expect(result.data).toMatchObject({
    error: {
      code: 'WRITE_OUTCOME_UNKNOWN',
      hint: expect.stringContaining('same proposalId') as unknown,
    },
  });
});

const contextOperations = [
  { type: 'create_character', ref: 'alya', fields: { name: 'Alya', isPlayable: true } },
  { type: 'create_location', ref: 'station', fields: { name: 'Station', category: 'Hub' } },
  {
    type: 'create_interaction',
    inputInteractions: ['start'],
    fields: {
      title: 'Lab',
      locationId: { ref: 'station' },
      characterIds: ['old', { ref: 'alya' }],
    },
    defaultTrigger: {
      conditionGroups: [
        {
          conditions: [
            { characterId: { ref: 'alya' }, isPresent: true },
            { locationId: { ref: 'station' }, isCurrentLocation: true },
          ],
        },
      ],
    },
  },
  { type: 'update_character', character: { ref: 'alya' }, fields: { description: 'Engineer' } },
  { type: 'update_location', location: 'existing', fields: { imageUrl: '' } },
];

it('forwards character and location operations and references unchanged', async () => {
  const contextPreview: RouteResponse = {
    body: {
      ...validPreviewBody,
      createdEntities: [{ kind: 'character', operationIndex: 0, id: 'provisional', ref: 'alya' }],
      summary: {
        counts: { charactersAdded: 1 },
        provisionalIds: true,
        interactions: [],
        triggers: [],
        characters: [{ change: 'added', id: 'provisional', ref: 'alya', name: 'Alya', fields: [] }],
        locations: [],
        statDefinitions: [],
        statAssignments: [],
        connections: [],
      },
    },
  };
  const api = stubFetch({ [`POST ${base}/preview`]: contextPreview });
  const { call } = await connect(api.fetchImpl);

  const result = await call('preview_story_changes', { storyId, operations: contextOperations });

  expect(result.isError).toBe(false);
  expect(result.data).toMatchObject({
    idsAreProvisional: true,
    createdEntities: [{ kind: 'character', ref: 'alya' }],
    summary: { characters: [{ change: 'added', ref: 'alya', name: 'Alya' }] },
  });
  expect(api.requests[0]).toMatchObject({
    body: { version: 1, operations: contextOperations },
  });
});

it('rejects malformed context operations before calling the API', async () => {
  const api = stubFetch({ [`POST ${base}/preview`]: validPreview });
  const { call } = await connect(api.fetchImpl);
  const invalid = [
    [{ type: 'create_character' }],
    [{ type: 'create_character', fields: { description: 'No name' } }],
    [{ type: 'create_location', fields: { category: 'Hub' } }],
    [{ type: 'create_location', fields: { name: '' } }],
    [{ type: 'create_character', fields: { name: 'A', unknown: 1 } }],
    [{ type: 'create_location', fields: { name: 'A', isPlayable: true } }],
    [{ type: 'update_character', fields: { name: 'A' } }],
    [{ type: 'update_location', location: { ref: '1bad' }, fields: { name: 'A' } }],
    [{ type: 'create_interaction', fields: { characterIds: [{ ref: 'a', extra: 1 }] } }],
  ];

  for (const batch of invalid) {
    expect((await call('preview_story_changes', { storyId, operations: batch })).isError).toBe(
      true,
    );
  }
  expect(api.requests).toEqual([]);
});

it('accepts updates without a name but requires one to create', async () => {
  const api = stubFetch({ [`POST ${base}/preview`]: validPreview });
  const { call } = await connect(api.fetchImpl);

  const update = await call('preview_story_changes', {
    storyId,
    operations: [
      { type: 'update_character', character: 'c', fields: { isPlayable: true } },
      { type: 'update_location', location: 'l', fields: { category: '' } },
    ],
  });

  expect(update.isError).toBe(false);
  expect(api.requests).toHaveLength(1);
});

const statOperations = [
  {
    type: 'create_stat_definition',
    ref: 'reserveDef',
    fields: { name: 'Réserve électrique', valueType: 'number' },
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
    statDefinition: { ref: 'reserveDef' },
    owner: { type: 'character', id: { ref: 'alya' } },
    fields: { initialValue: 50 },
  },
  {
    type: 'create_stat_assignment',
    statDefinition: 'existing-definition',
    owner: { type: 'itemDefinition', id: 'existing-item' },
    fields: { initialValue: true },
  },
  { type: 'update_stat_definition', statDefinition: 'd', fields: { changePerHour: 0 } },
  { type: 'update_stat_assignment', assignment: { ref: 'reserve' }, fields: { initialValue: 90 } },
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
            { statId: 'x', operator: 'lt', comparisonStatId: { ref: 'reserve' } },
          ],
        },
      ],
    },
  },
];

it('forwards stat operations and references unchanged, and reads the new entity kinds', async () => {
  const statPreview: RouteResponse = {
    body: {
      ...validPreviewBody,
      createdEntities: [
        { kind: 'statDefinition', operationIndex: 0, id: 'p1', ref: 'reserveDef' },
        { kind: 'statAssignment', operationIndex: 1, id: 'p2', ref: 'reserve' },
      ],
      summary: {
        counts: { statDefinitionsAdded: 1, statAssignmentsAdded: 1 },
        provisionalIds: true,
        interactions: [],
        triggers: [],
        statDefinitions: [{ change: 'added', id: 'p1', ref: 'reserveDef' }],
        statAssignments: [{ change: 'added', id: 'p2', ref: 'reserve' }],
        connections: [],
      },
    },
  };
  const api = stubFetch({ [`POST ${base}/preview`]: statPreview });
  const { call } = await connect(api.fetchImpl);

  const result = await call('preview_story_changes', { storyId, operations: statOperations });

  expect(result.isError).toBe(false);
  expect(result.data).toMatchObject({
    createdEntities: [{ kind: 'statDefinition' }, { kind: 'statAssignment' }],
    summary: {
      statDefinitions: [{ ref: 'reserveDef' }],
      statAssignments: [{ ref: 'reserve' }],
    },
  });
  expect(api.requests[0]).toMatchObject({ body: { version: 1, operations: statOperations } });
});

async function expectRejectedBeforeApi(invalid: object[][]) {
  const api = stubFetch({ [`POST ${base}/preview`]: validPreview });
  const { call } = await connect(api.fetchImpl);

  for (const batch of invalid) {
    expect((await call('preview_story_changes', { storyId, operations: batch })).isError).toBe(
      true,
    );
  }
  expect(api.requests).toEqual([]);
}

it('rejects malformed stat definitions before calling the API', async () => {
  const definition = { name: 'N', valueType: 'number' };
  await expectRejectedBeforeApi([
    // The value type is required and fixed.
    [{ type: 'create_stat_definition', fields: { name: 'N' } }],
    [{ type: 'create_stat_definition', fields: { name: 'N', valueType: 'integer' } }],
    [{ type: 'update_stat_definition', statDefinition: 'd', fields: { valueType: 'string' } }],
    [{ type: 'create_stat_definition', fields: { ...definition, unknown: 1 } }],
  ]);
});

it('rejects malformed stat assignments before calling the API', async () => {
  const assign = (extra: object) => [
    {
      type: 'create_stat_assignment',
      statDefinition: 'd',
      owner: { type: 'story' },
      fields: { initialValue: 1 },
      ...extra,
    },
  ];
  await expectRejectedBeforeApi([
    // Assignments need a definition, an owner and a value.
    assign({ statDefinition: undefined }),
    assign({ owner: undefined }),
    assign({ fields: {} }),
    assign({ owner: { type: 'story', id: 'x' } }),
    assign({ owner: { type: 'character' } }),
    assign({ owner: { type: 'itemDefinition', id: { ref: 'a' } } }),
    assign({ owner: { type: 'team', id: 'x' } }),
    [{ type: 'update_stat_assignment', fields: { initialValue: 1 } }],
    [{ type: 'update_stat_assignment', assignment: 'a', fields: { initialValue: null } }],
    [{ type: 'update_stat_assignment', assignment: 'a', fields: { initialValue: 1, owner: 'x' } }],
  ]);
});
