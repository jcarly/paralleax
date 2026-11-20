import { join } from 'node:path';
import { expect, it } from 'vitest';
import { apiUrlFromEnvironment, sessionFilePath } from './config.js';
import { IdempotencyCache } from './idempotency.js';
import { createToolLogger } from './logger.js';
import { apiError, connectPerTest, interaction, stubFetch } from './test/fake-api.js';

const connect = connectPerTest();
const storyId = '44444444-4444-4444-8444-444444444444';
const base = `/stories/${storyId}`;

it('resolves the API URL and session file from the environment', () => {
  expect(apiUrlFromEnvironment({}).href).toBe('http://localhost:3000/api');
  expect(apiUrlFromEnvironment({ PARALLEAX_API_URL: 'https://p.example/api' }).host).toBe(
    'p.example',
  );
  expect(sessionFilePath({ PARALLEAX_MCP_SESSION_FILE: '/tmp/s.json' })).toBe('/tmp/s.json');
  expect(sessionFilePath({ XDG_CONFIG_HOME: '/cfg' })).toBe(
    join('/cfg', 'paralleax-mcp', 'session.json'),
  );
  expect(sessionFilePath({})).toMatch(/\.config[/\\]paralleax-mcp[/\\]session\.json$/);
});

it('writes one JSON line per tool call', () => {
  const lines: string[] = [];
  createToolLogger((line) => lines.push(line)).log({ tool: 't', outcome: 'ok', durationMs: 3 });
  expect(lines[0]).toMatch(/^\{"at":".+","tool":"t","outcome":"ok","durationMs":3\}\n$/);
});

it('forgets failed, expired and evicted idempotent calls', async () => {
  let now = 0;
  const cache = new IdempotencyCache<number>({ ttlMs: 10, maxEntries: 1, now: () => now });
  const fail = () => Promise.reject(new Error('x'));
  await expect(cache.run('s', 'key-0001', {}, fail)).rejects.toThrow();
  expect((await cache.run('s', 'key-0001', { a: 1 }, () => Promise.resolve(1))).replayed).toBe(
    false,
  );
  // Key order and undefined fields do not change the fingerprint.
  const replay = await cache.run('s', 'key-0001', { b: undefined, a: 1 }, () => Promise.resolve(2));
  expect(replay).toEqual({ result: 1, replayed: true });
  // maxEntries 1: a second key evicts the first one.
  expect((await cache.run('s', 'key-0002', [1], () => Promise.resolve(3))).result).toBe(3);
  expect((await cache.run('s', 'key-0001', {}, () => Promise.resolve(4))).result).toBe(4);
  now = 20;
  expect((await cache.run('s', 'key-0001', { c: 1 }, () => Promise.resolve(5))).result).toBe(5);
  expect((await cache.run('s', undefined, {}, () => Promise.resolve(6))).replayed).toBe(false);
});

it('places a root interaction with the shared root rule', async () => {
  const story = { id: storyId, title: 'S', interactions: [interaction('a')] };
  const api = stubFetch({
    [`GET ${base}`]: { body: story },
    [`POST ${base}/interactions`]: (request) => ({
      body: { revision: 2, interaction: interaction('n', { position: request.body.position }) },
    }),
    [`PATCH ${base}/interactions/n`]: { body: { revision: 3, interaction: interaction('n') } },
  });
  const { call } = await connect(api.fetchImpl);
  const result = await call('create_interaction', { storyId, title: 'Root' });
  expect(result.isError).toBe(false);
  expect(api.requests[1]?.body).not.toHaveProperty('parentId');
  expect(api.requests[1]?.body).toHaveProperty('position');
});

it('refuses a parent outside the story before creating anything', async () => {
  const page = { revision: 1, hasMore: false, interactions: [] };
  const api = stubFetch({ [`GET ${base}/editor/interactions`]: { body: page } });
  const { call } = await connect(api.fetchImpl);
  const result = await call('create_interaction', {
    storyId,
    title: 'Orphan',
    parentInteractionId: 'missing',
  });
  expect(result.data).toMatchObject({ error: { code: 'PARENT_INTERACTION_NOT_FOUND' } });
  expect(api.requests.map(({ method }) => method)).toEqual(['GET']);
});

it('reads structure without context and tolerates missing content entries', async () => {
  const meta = { revision: 1, hasMore: true };
  const api = stubFetch({
    [`GET ${base}/editor`]: {
      body: {
        id: storyId,
        title: 'S',
        revision: 1,
        interactionCount: 1,
        triggerCount: 1,
        contextCounts: {},
      },
    },
    [`GET ${base}/editor/interactions`]: {
      body: { ...meta, interactions: [{ id: 'a', title: 'A', position: { x: 0, y: 0 } }] },
    },
    [`GET ${base}/editor/content/interactions`]: { body: { ...meta, interactions: [] } },
    [`GET ${base}/editor/triggers`]: {
      body: { ...meta, triggers: [{ id: 't', inputInteractionIds: [], outputInteractionId: 'a' }] },
    },
    [`GET ${base}/editor/content/triggers`]: { body: { ...meta, triggers: [] } },
  });
  const { call } = await connect(api.fetchImpl);
  const result = await call('get_story_structure', { storyId, includeContext: false, page: 2 });
  expect(result.data).toMatchObject({
    story: { canEdit: false },
    interactions: [{ id: 'a', bodyLength: 0, locationId: null }],
    triggers: [{ id: 't', conditionGroups: [], timerSeconds: null }],
    hasMoreInteractions: true,
    consistentRevision: true,
  });
  expect(result.data).not.toHaveProperty('context');
  expect(api.requests.some(({ path }) => path.endsWith('/context'))).toBe(false);
});

it('maps unknown API error bodies to their HTTP status', async () => {
  const api = stubFetch({ 'GET /stories': { status: 500, body: 'oops' } });
  const forbidden = stubFetch({ 'GET /stories': apiError(403, 'STORY_ACCESS_DENIED') });
  const first = await connect(api.fetchImpl);
  expect((await first.call('list_stories', {})).data).toMatchObject({
    error: { code: 'HTTP_500', message: 'Request failed' },
  });
  const second = await connect(forbidden.fetchImpl);
  expect((await second.call('list_stories', {})).data).toMatchObject({
    error: { hint: expect.stringContaining('cannot') as unknown },
  });
});
