import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it as vitestIt } from 'vitest';
import { z } from 'zod';
import { e2eApiUrl, readStory, register, rest, type Account } from './test/e2e-api.js';
import { connectToApi, type McpSession } from './test/real-api.js';

/**
 * End-to-end: a real MCP client and server against a running Paralleax API and
 * PostgreSQL database, with real accounts, sessions, guards and permissions.
 * Set PARALLEAX_MCP_E2E_API_URL (a development API, never production) to run.
 */
const it = e2eApiUrl === undefined ? vitestIt.skip : vitestIt;
const interactionQuota = Number(process.env.PARALLEAX_MCP_E2E_INTERACTION_QUOTA ?? '0');
const idSchema = z.looseObject({ id: z.string() });
const title = `La dernière transmission ${randomUUID().slice(0, 8)}`;
const sessions: McpSession[] = [];
const accounts: Record<'owner' | 'viewer' | 'outsider', Account> = {
  owner: { email: '', token: '' },
  viewer: { email: '', token: '' },
  outsider: { email: '', token: '' },
};
let storyId = '';
let otherStoryId = '';

async function mcp(account: Account) {
  const session = await connectToApi(account.token);
  sessions.push(session);
  return session;
}

async function createStory(storyTitle: string) {
  const created = await rest(accounts.owner.token, 'POST', '/stories', { title: storyTitle });
  return idSchema.parse(created.json).id;
}

beforeAll(async () => {
  if (e2eApiUrl === undefined) {
    return;
  }
  accounts.owner = await register('owner');
  accounts.viewer = await register('viewer');
  accounts.outsider = await register('outsider');
  storyId = await createStory(title);
  otherStoryId = await createStory('Other story');
  // ADR-017: direct grants apply to invitation stories; private stays owner-only.
  await rest(accounts.owner.token, 'PATCH', `/stories/${storyId}/access`, {
    visibility: 'invitation',
    editPolicy: 'collaborators',
    commentPolicy: 'editors',
  });
  const path = `/stories/${storyId}/access/collaborators`;
  const shared = await rest(accounts.owner.token, 'POST', path, {
    email: accounts.viewer.email,
    role: 'viewer',
  });
  expect(shared.status).toBe(201);
});

afterAll(async () => {
  await Promise.all(sessions.map((session) => session.close()));
});

async function createBranches(owner: McpSession, parentInteractionId: string) {
  const branchIds: string[] = [];
  for (const branchTitle of ['Déchiffrer le message', 'Ignorer le message']) {
    const branch = await owner.ok('create_interaction', {
      storyId,
      title: branchTitle,
      body: `<p>${branchTitle}.</p>`,
      parentInteractionId,
    });
    branchIds.push(idSchema.parse(branch.interaction).id);
  }
  return branchIds;
}

async function runtimeOptions(currentInteractionId: string) {
  const slice = await rest(accounts.owner.token, 'POST', `/stories/${storyId}/runtime/slice`, {
    currentInteractionId,
    includeOptions: true,
    page: 1,
    pageSize: 50,
  });
  return z.looseObject({ optionInteractionIds: z.array(z.string()) }).parse(slice.json)
    .optionInteractionIds;
}

it('runs the demo scenario: read, create a message, add two branches', async () => {
  const owner = await mcp(accounts.owner);
  const listed = await owner.ok('list_stories', { query: title, filter: 'editable' });
  expect(listed).toMatchObject({ stories: [{ id: storyId, canEdit: true }] });
  const structure = await owner.ok('get_story_structure', { storyId });
  expect(structure).toMatchObject({ story: { interactionCount: 2 }, consistentRevision: true });
  const root = z.array(idSchema).parse(structure.interactions)[0]?.id;
  const args = {
    storyId,
    title: 'Le message crypté',
    body: '<p>Un message <strong>chiffré</strong>.</p><script>alert(1)</script>',
    parentInteractionId: root,
    idempotencyKey: `message-${storyId}`,
  };
  const message = await owner.ok('create_interaction', args);
  const messageId = idSchema.parse(message.interaction).id;
  expect(message).toMatchObject({ connectedFrom: root, bodyChangedBySanitizer: true });
  const replay = await owner.ok('create_interaction', args);
  expect(replay).toMatchObject({ replayed: true, interaction: { id: messageId } });
  const branchIds = await createBranches(owner, messageId);
  expect(await owner.ok('get_interaction', { storyId, interactionId: messageId })).toMatchObject({
    interaction: { body: '<p>Un message <strong>chiffré</strong>.</p>' },
    incomingTriggers: [{ inputInteractionIds: [root] }],
    outgoingConnections: branchIds.map((id) => ({ targetInteractionId: id })),
  });
  // The reader and Simulation runtime offers both branches after the message.
  expect(await runtimeOptions(messageId)).toEqual(expect.arrayContaining(branchIds));
});

it('shows MCP changes to the editor reads and records them in history', async () => {
  const story = await readStory(accounts.owner.token, storyId);
  expect(story.interactions.map((interaction) => interaction.title)).toEqual(
    expect.arrayContaining(['Le message crypté', 'Déchiffrer le message', 'Ignorer le message']),
  );
  const history = await rest(accounts.owner.token, 'GET', `/stories/${storyId}/history`);
  expect(JSON.stringify(history.json)).toContain('interaction');
});

it('updates fields selectively and keeps the Trigger connection invariant', async () => {
  const owner = await mcp(accounts.owner);
  const { interactions } = await readStory(accounts.owner.token, storyId);
  const updated = await owner.ok('update_interaction', {
    storyId,
    interactionId: interactions[1]?.id,
    changes: { title: 'Station relais', durationMinutes: 5 },
  });
  expect(updated).toMatchObject({ interaction: { title: 'Station relais', durationMinutes: 5 } });
  // first → second already exists through the default Trigger.
  const duplicate = await owner.call('create_trigger', {
    storyId,
    targetInteractionId: interactions[1]?.id,
    inputInteractionIds: [interactions[0]?.id],
  });
  expect(duplicate).toMatchObject({
    isError: true,
    data: { error: { code: 'TRIGGER_CONNECTION_EXISTS' } },
  });
});

it('creates a conditional Trigger that the editor history can undo', async () => {
  const owner = await mcp(accounts.owner);
  const { interactions } = await readStory(accounts.owner.token, storyId);
  const firstId = interactions[0]?.id ?? '';
  const secondId = interactions[1]?.id ?? '';
  const created = await owner.ok('create_trigger', {
    storyId,
    targetInteractionId: firstId,
    inputInteractionIds: [secondId],
    conditionGroups: [{ conditions: [{ interactionId: secondId, hasBeenVisited: true }] }],
  });
  expect(created).toMatchObject({
    trigger: { outputInteractionId: firstId, inputInteractionIds: [secondId] },
  });
  const undo = await rest(accounts.owner.token, 'POST', `/stories/${storyId}/history/undo`);
  expect(undo.status).toBe(201);
  const restored = (await readStory(accounts.owner.token, storyId)).interactions.find(
    ({ id }) => id === firstId,
  );
  const reconnected = restored?.triggers.some(({ inputInteractionIds }) =>
    inputInteractionIds.includes(secondId),
  );
  expect(reconnected).toBe(false);
});

it('rejects references from another story through the API validation', async () => {
  const owner = await mcp(accounts.owner);
  const foreign = await readStory(accounts.owner.token, otherStoryId);
  const own = await readStory(accounts.owner.token, storyId);
  const result = await owner.call('create_trigger', {
    storyId,
    targetInteractionId: own.interactions[0]?.id,
    inputInteractionIds: [foreign.interactions[0]?.id],
  });
  expect(result).toMatchObject({ isError: true, data: { error: { status: 400 } } });
});

it('lets a viewer read but never write', async () => {
  const viewer = await mcp(accounts.viewer);
  const before = await readStory(accounts.owner.token, storyId);
  expect(await viewer.ok('get_story_structure', { storyId })).toMatchObject({
    story: { canEdit: false },
  });
  const write = await viewer.call('create_interaction', { storyId, title: 'Intrusion' });
  const update = await viewer.call('update_interaction', {
    storyId,
    interactionId: before.interactions[0]?.id,
    changes: { title: 'Intrusion' },
  });
  expect(write).toMatchObject({ isError: true, data: { error: { status: 403 } } });
  expect(update).toMatchObject({ isError: true, data: { error: { status: 403 } } });
  expect((await readStory(accounts.owner.token, storyId)).revision).toBe(before.revision);
  // A grant on one story gives nothing on the owner's private story.
  const other = await viewer.call('get_story_structure', { storyId: otherStoryId });
  expect(other).toMatchObject({ isError: true, data: { error: { status: 404 } } });
});

it('hides private and invitation-only stories from users without a grant', async () => {
  const outsider = await mcp(accounts.outsider);
  expect(await outsider.ok('list_stories', { query: title })).toMatchObject({ stories: [] });
  const attempts = [
    ['get_story_structure', { storyId }],
    ['get_interaction', { storyId, interactionId: 'any' }],
    ['create_interaction', { storyId, title: 'Intrusion', position: { x: 0, y: 0 } }],
    ['get_story_structure', { storyId: otherStoryId }],
    [
      'create_trigger',
      { storyId: otherStoryId, targetInteractionId: 'a', inputInteractionIds: ['b'] },
    ],
  ] as const;
  for (const [tool, args] of attempts) {
    expect(await outsider.call(tool, args)).toMatchObject({
      isError: true,
      data: { error: { status: 404 } },
    });
  }
});

// Run the API with PARALLEAX_STORY_QUOTA_INTERACTIONS set to the same small value.
(interactionQuota > 0 ? it : vitestIt.skip)('keeps the API story quotas', async () => {
  const owner = await mcp(accounts.owner);
  const quotaStoryId = await createStory('Quota story');
  const results = [];
  // A new story has 2 interactions; the call that would exceed the quota fails.
  for (let count = 3; count <= interactionQuota + 1; count += 1) {
    results.push(
      await owner.call('create_interaction', {
        storyId: quotaStoryId,
        title: `Step ${count}`,
        position: { x: 0, y: count * 140 },
      }),
    );
  }
  expect(results.slice(0, -1).every(({ isError }) => !isError)).toBe(true);
  expect(results.at(-1)).toMatchObject({
    isError: true,
    data: { error: { code: 'STORY_QUOTA_EXCEEDED', status: 422 } },
  });
});

it('rejects an invalid session', async () => {
  const anonymous = await mcp({ email: '', token: 'not-a-session' });
  expect(await anonymous.call('list_stories', {})).toMatchObject({
    isError: true,
    data: { error: { code: 'AUTHENTICATION_REQUIRED' } },
  });
});
