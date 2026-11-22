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
  summary: { counts: { interactionsAdded: 1 }, interactions: [], triggers: [], connections: [] },
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
