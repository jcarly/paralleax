import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  apiError,
  connectPerTest,
  interaction,
  stubFetch,
  type RecordedRequest,
  type RouteResponse,
} from './test/fake-api.js';

const connect = connectPerTest();
const storyId = '22222222-2222-4222-8222-222222222222';
const base = `/stories/${storyId}`;
const defaultTrigger = {
  triggers: [{ id: 't', inputInteractionIds: ['parent'], conditionGroups: [] }],
};

function mutation(id: string, overrides: Record<string, unknown> = {}) {
  return {
    revision: 9,
    updatedAt: '2026-11-20T10:00:00.000Z',
    interaction: interaction(id, overrides),
  };
}

const parentPage = {
  revision: 8,
  page: 1,
  pageSize: 200,
  hasMore: false,
  interactions: [{ id: 'parent', title: 'Parent', position: { x: 80, y: 120 } }],
};

function creationRoutes(patch: (request: RecordedRequest) => RouteResponse) {
  return {
    [`GET ${base}/editor/interactions`]: { body: parentPage },
    [`POST ${base}/interactions`]: (request: RecordedRequest) => ({
      body: mutation('created', {
        ...defaultTrigger,
        title: '',
        body: '',
        position: request.body.position,
      }),
    }),
    [`PATCH ${base}/interactions/created`]: patch,
  };
}

const echoPatch = (request: RecordedRequest) => ({
  body: mutation('created', { ...request.body, ...defaultTrigger }),
});

it('creates a branch from a parent with the shared placement rule, then saves content', async () => {
  const api = stubFetch(creationRoutes(echoPatch));
  const { call } = await connect(api.fetchImpl);
  const body = '<p>A cipher scrolls across the screen.</p>';
  const result = await call('create_interaction', {
    storyId,
    title: 'Encrypted message',
    body,
    parentInteractionId: 'parent',
  });
  expect(api.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    `GET ${base}/editor/interactions`,
    `POST ${base}/interactions`,
    `PATCH ${base}/interactions/created`,
  ]);
  // getNextChildPosition places the child one row below its parent.
  expect(api.requests[1]?.body).toEqual({ parentId: 'parent', position: { x: 80, y: 252 } });
  expect(api.requests[2]?.body).toEqual({ title: 'Encrypted message', body });
  expect(result.data).toMatchObject({
    interaction: { id: 'created', title: 'Encrypted message', excerpt: body.slice(3, -4) },
    incomingTriggers: [{ inputInteractionIds: ['parent'], outputInteractionId: 'created' }],
    connectedFrom: 'parent',
    bodyChangedBySanitizer: false,
    replayed: false,
  });
});

it('reports a partially applied creation instead of hiding the created interaction', async () => {
  const api = stubFetch(creationRoutes(() => apiError(429, 'RATE_LIMITED', 'Too many', 'r1')));
  const { call } = await connect(api.fetchImpl);
  const result = await call('create_interaction', {
    storyId,
    title: 'Encrypted message',
    position: { x: 0, y: 0 },
  });
  expect(result).toMatchObject({
    isError: true,
    data: {
      error: {
        code: 'PARTIALLY_APPLIED',
        details: {
          createdInteractionId: 'created',
          cause: { code: 'RATE_LIMITED', requestId: 'r1' },
        },
      },
    },
  });
});

it('replays a write with the same idempotency key and refuses a reused key', async () => {
  const api = stubFetch(creationRoutes(echoPatch));
  const { call } = await connect(api.fetchImpl);
  const args = {
    storyId,
    title: 'Once',
    position: { x: 1, y: 2 },
    idempotencyKey: 'demo-key-0001',
  };
  const first = await call('create_interaction', args);
  const second = await call('create_interaction', args);
  expect(first.data).toMatchObject({ replayed: false });
  expect(second.data).toMatchObject({ replayed: true, interaction: { id: 'created' } });
  expect(api.requests.filter(({ method }) => method === 'POST')).toHaveLength(1);
  const reused = await call('create_interaction', { ...args, title: 'Different' });
  expect(reused).toMatchObject({
    isError: true,
    data: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } },
  });
});

it('updates only the fields provided', async () => {
  const api = stubFetch({
    [`PATCH ${base}/interactions/a`]: { body: mutation('a', { title: 'New title' }) },
  });
  const { call } = await connect(api.fetchImpl);
  const result = await call('update_interaction', {
    storyId,
    interactionId: 'a',
    changes: { title: 'New title', locationId: null },
  });
  expect(result.data).toMatchObject({ revision: 9, interaction: { title: 'New title' } });
  expect(api.requests[0]?.body).toEqual({ title: 'New title', locationId: null });
});

it('reports when the API sanitizer changed the submitted body', async () => {
  const api = stubFetch({
    [`PATCH ${base}/interactions/a`]: { body: mutation('a', { body: '<p>safe</p>' }) },
  });
  const { call } = await connect(api.fetchImpl);
  const result = await call('update_interaction', {
    storyId,
    interactionId: 'a',
    changes: { body: '<p onclick="x()">safe</p><script>x()</script>' },
  });
  expect(result.data).toMatchObject({ bodyChangedBySanitizer: true });
});

it('creates a trigger with generated condition group ids', async () => {
  const api = stubFetch({
    [`POST ${base}/interactions/target/triggers`]: (request) => ({
      body: {
        revision: 10,
        interactionId: 'target',
        trigger: { id: 'new-trigger', ...request.body },
      },
    }),
  });
  const { call } = await connect(api.fetchImpl);
  const result = await call('create_trigger', {
    storyId,
    targetInteractionId: 'target',
    inputInteractionIds: ['a', 'b'],
    conditionGroups: [{ conditions: [{ interactionId: 'c', hasBeenVisited: true }] }],
    appearanceProbability: 50,
  });
  const sent = z
    .object({ conditionGroups: z.array(z.object({ id: z.uuid() })) })
    .parse(api.requests[0]?.body);
  expect(sent.conditionGroups).toHaveLength(1);
  expect(result.data).toMatchObject({
    revision: 10,
    trigger: {
      id: 'new-trigger',
      outputInteractionId: 'target',
      inputInteractionIds: ['a', 'b'],
      appearanceProbability: 50,
      timerSeconds: null,
    },
  });
});

it('forwards the API trigger invariant error with a hint', async () => {
  const conflict = apiError(409, 'TRIGGER_CONNECTION_EXISTS', 'Another Trigger connects these');
  const api = stubFetch({
    [`POST ${base}/interactions/target/triggers`]: {
      ...conflict,
      body: { ...conflict.body, details: { triggerId: 'existing' } },
    },
  });
  const { call } = await connect(api.fetchImpl);
  const result = await call('create_trigger', {
    storyId,
    targetInteractionId: 'target',
    inputInteractionIds: ['a'],
  });
  expect(result).toMatchObject({
    isError: true,
    data: {
      error: {
        code: 'TRIGGER_CONNECTION_EXISTS',
        status: 409,
        details: { triggerId: 'existing' },
        hint: expect.stringContaining('reuse') as unknown,
      },
    },
  });
});
