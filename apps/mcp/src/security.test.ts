import { expect, it } from 'vitest';
import { apiError, connectPerTest, stubFetch, TEST_TOKEN } from './test/fake-api.js';

const connect = connectPerTest();
const storyId = '33333333-3333-4333-8333-333333333333';

it('sends nothing to the API without a session', async () => {
  const api = stubFetch({});
  const { call } = await connect(api.fetchImpl, { sessionToken: null });
  const result = await call('list_stories', {});
  expect(result).toMatchObject({
    isError: true,
    data: { error: { code: 'AUTHENTICATION_REQUIRED' } },
  });
  expect(api.requests).toHaveLength(0);
});

it('maps API authentication, access and not-found errors without leaking the token', async () => {
  const api = stubFetch({
    'GET /stories': apiError(401, 'AUTHENTICATION_REQUIRED'),
    [`POST /stories/${storyId}/interactions`]: apiError(403, 'FORBIDDEN'),
    [`GET /stories/${storyId}`]: apiError(404, 'STORY_NOT_FOUND'),
  });
  const { call, logs } = await connect(api.fetchImpl);
  const unauthenticated = await call('list_stories', {});
  const forbidden = await call('create_interaction', {
    storyId,
    title: 'x',
    position: { x: 0, y: 0 },
  });
  const hidden = await call('get_interaction', { storyId, interactionId: 'a' });
  expect(unauthenticated.data).toMatchObject({
    error: { status: 401, hint: expect.stringContaining('login') as unknown },
  });
  expect(forbidden.data).toMatchObject({ error: { code: 'FORBIDDEN', status: 403 } });
  expect(hidden.data).toMatchObject({ error: { code: 'STORY_NOT_FOUND', status: 404 } });
  expect(JSON.stringify([unauthenticated, forbidden, hidden, logs])).not.toContain(TEST_TOKEN);
  expect(logs.map(({ outcome, code }) => `${outcome}:${code}`)).toEqual([
    'error:AUTHENTICATION_REQUIRED',
    'error:FORBIDDEN',
    'error:STORY_NOT_FOUND',
  ]);
});

it.each([
  ['an unknown field', { storyId, title: 'x', ownerId: 'someone-else' }],
  ['a path traversal identifier', { storyId: '..', title: 'x' }],
  ['an empty title', { storyId, title: '   ' }],
  ['an oversized body', { storyId, title: 'x', body: 'x'.repeat(64_001) }],
])('rejects %s before calling the API', async (_case, args) => {
  const api = stubFetch({});
  const { client } = await connect(api.fetchImpl);
  const result = await client
    .callTool({ name: 'create_interaction', arguments: args })
    .catch(() => ({ isError: true }));
  expect(result.isError).toBe(true);
  expect(api.requests).toHaveLength(0);
});

it('refuses an empty update and a trigger without inputs', async () => {
  const api = stubFetch({});
  const { client } = await connect(api.fetchImpl);
  const empty = await client.callTool({
    name: 'update_interaction',
    arguments: { storyId, interactionId: 'a', changes: {} },
  });
  const noInputs = await client.callTool({
    name: 'create_trigger',
    arguments: { storyId, targetInteractionId: 'a', inputInteractionIds: [] },
  });
  expect([empty.isError, noInputs.isError]).toEqual([true, true]);
  expect(api.requests).toHaveLength(0);
});

it('rejects API responses that break the expected contract', async () => {
  const api = stubFetch({ 'GET /stories': { body: { unexpected: true } } });
  const { call } = await connect(api.fetchImpl);
  const result = await call('list_stories', {});
  expect(result.data).toMatchObject({ error: { code: 'API_CONTRACT_MISMATCH' } });
});

it('reports an unreachable API without exposing internals', async () => {
  const { call } = await connect(() => Promise.reject(new Error('ECONNREFUSED secret-host')));
  const result = await call('list_stories', {});
  expect(result.data).toMatchObject({ error: { code: 'API_UNREACHABLE' } });
  expect(JSON.stringify(result)).not.toContain('secret-host');
});
