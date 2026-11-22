import { join } from 'node:path';
import { expect, it } from 'vitest';
import { apiUrlFromEnvironment, sessionFilePath } from './config.js';
import { createToolLogger } from './logger.js';
import { apiError, connectPerTest, stubFetch } from './test/fake-api.js';
import { ProposalStore } from './tools/story-change-tools.js';

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

it('keeps previewed proposals per story, for a limited time and number', () => {
  let now = 0;
  const store = new ProposalStore({ ttlMs: 10, maxEntries: 1, now: () => now });
  const proposal = { storyId, baseRevision: 3, operations: [] };
  store.remember('p1', proposal);
  expect(store.find(storyId, 'p1')).toMatchObject({ baseRevision: 3 });
  expect(store.find('another-story', 'p1')).toBeUndefined();
  // maxEntries 1: a second proposal evicts the first one.
  store.remember('p2', proposal);
  expect(store.find(storyId, 'p1')).toBeUndefined();
  now = 20;
  expect(store.find(storyId, 'p2')).toBeUndefined();
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
