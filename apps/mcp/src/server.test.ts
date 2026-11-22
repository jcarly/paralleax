import { expect, it } from 'vitest';
import { connectPerTest, interaction, stubFetch, TEST_TOKEN } from './test/fake-api.js';

const connect = connectPerTest();
const storyId = '11111111-1111-4111-8111-111111111111';
const editor = `/stories/${storyId}/editor`;
const page = { page: 1, pageSize: 50, hasMore: false };

const structureRoutes = {
  [`GET ${editor}`]: {
    body: {
      id: storyId,
      title: 'La dernière transmission',
      revision: 7,
      capabilities: { canRead: true, canEdit: true, canManage: false, canComment: true },
      interactionCount: 2,
      triggerCount: 2,
      contextCounts: { locations: 1, characters: 0 },
    },
  },
  [`GET ${editor}/interactions`]: {
    body: {
      ...page,
      revision: 7,
      interactions: [
        { id: 'a', title: 'Signal', position: { x: 80, y: 120 }, locationId: 'loc' },
        { id: 'b', title: 'Reply', position: { x: 80, y: 252 } },
      ],
    },
  },
  [`GET ${editor}/content/interactions`]: {
    body: {
      ...page,
      revision: 7,
      interactions: [
        { interactionId: 'a', body: '<p>Static &amp; <strong>noise</strong></p>' },
        {
          interactionId: 'b',
          body: '',
          statEffects: [{ statId: 's', operation: 'add', value: 1 }],
        },
      ],
    },
  },
  [`GET ${editor}/triggers`]: {
    body: {
      ...page,
      revision: 7,
      triggers: [
        { id: 'ta', inputInteractionIds: [], outputInteractionId: 'a' },
        { id: 'tb', inputInteractionIds: ['a'], outputInteractionId: 'b' },
      ],
    },
  },
  [`GET ${editor}/content/triggers`]: {
    body: {
      ...page,
      revision: 8,
      triggers: [{ triggerId: 'tb', conditionGroups: [{ id: 'g', conditions: [] }] }],
    },
  },
  [`GET ${editor}/context`]: {
    body: {
      ...page,
      revision: 7,
      locations: [{ id: 'loc', name: 'Relay station', description: '' }],
      characters: [],
      statDefinitions: [{ id: 's', name: 'Trust' }],
      itemDefinitions: [],
    },
  },
};

const storyList = {
  items: [
    {
      id: storyId,
      title: 'La dernière transmission',
      interactionCount: 2,
      revision: 3,
      updatedAt: '2026-11-20T10:00:00.000Z',
      owner: { id: 'u1', displayName: 'Author' },
      access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
      capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
    },
  ],
  page: 1,
  pageSize: 10,
  totalCount: 1,
  hasMore: false,
};

it('exposes read tools and the preview/commit pair only, with strict input schemas', async () => {
  const { client } = await connect(stubFetch({}).fetchImpl);
  const { tools } = await client.listTools();
  expect(tools.map(({ name }) => name).sort()).toEqual([
    'commit_story_changes',
    'get_interaction',
    'get_story_structure',
    'list_stories',
    'preview_story_changes',
  ]);
  for (const tool of tools) {
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.annotations?.destructiveHint).toBe(false);
  }
});

it('lists stories with the session cookie and summary fields only', async () => {
  const api = stubFetch({ 'GET /stories': { body: storyList } });
  const { call } = await connect(api.fetchImpl);
  const result = await call('list_stories', { query: 'transmission', pageSize: 10 });
  expect(result.isError).toBe(false);
  expect(result.data).toMatchObject({
    totalCount: 1,
    stories: [{ id: storyId, owner: 'Author', visibility: 'private', canEdit: false }],
  });
  expect(api.requests[0]).toMatchObject({
    query: { page: '1', pageSize: '10', query: 'transmission', filter: 'all', sort: 'updated' },
    headers: { cookie: `paralleax_session=${TEST_TOKEN}` },
  });
});

it('reads one page of story structure from the editor projections', async () => {
  const { call } = await connect(stubFetch(structureRoutes).fetchImpl);
  const result = await call('get_story_structure', { storyId });
  expect(result.isError).toBe(false);
  expect(result.data).toMatchObject({
    story: { title: 'La dernière transmission', revision: 7, canEdit: true },
    interactions: [
      { id: 'a', excerpt: 'Static & noise', locationId: 'loc' },
      { id: 'b', statEffects: [{ statId: 's' }] },
    ],
    triggers: [
      { id: 'ta', outputInteractionId: 'a', inputInteractionIds: [], appearanceProbability: 100 },
      { id: 'tb', inputInteractionIds: ['a'], conditionGroups: [{ id: 'g' }] },
    ],
    consistentRevision: false,
    context: { locations: [{ id: 'loc', name: 'Relay station' }] },
  });
});

it('reads an interaction with its incoming triggers and outgoing connections', async () => {
  const story = {
    id: storyId,
    revision: 4,
    title: 'Story',
    interactions: [
      interaction('a', { locationId: 'loc' }),
      interaction('b', {
        triggers: [{ id: 'tb', inputInteractionIds: ['a'], conditionGroups: [] }],
      }),
    ],
    locations: [{ id: 'loc', name: 'Relay station' }],
  };
  const api = stubFetch({ [`GET /stories/${storyId}`]: { body: story } });
  const { call } = await connect(api.fetchImpl);
  const result = await call('get_interaction', { storyId, interactionId: 'a' });
  expect(result.data).toMatchObject({
    interaction: { id: 'a', body: '<p>Body of a</p>' },
    references: { location: { name: 'Relay station' } },
    outgoingConnections: [{ triggerId: 'tb', targetInteractionId: 'b' }],
  });
  const missing = await call('get_interaction', { storyId, interactionId: 'zzz' });
  expect(missing).toMatchObject({
    isError: true,
    data: { error: { code: 'INTERACTION_NOT_FOUND' } },
  });
});
