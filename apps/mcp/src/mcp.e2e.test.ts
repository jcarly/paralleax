import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
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
const createdSchema = z.array(
  z.looseObject({ kind: z.string(), id: z.string(), ref: z.string().optional() }),
);
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

/** An encrypted message with three branches; two of them are conditional. */
function sceneOperations(rootId: string) {
  return [
    {
      type: 'create_interaction',
      ref: 'message',
      inputInteractions: [rootId],
      fields: {
        title: 'Le message crypté',
        body: '<p>Un message <strong>chiffré</strong>.</p><script>alert(1)</script>',
      },
    },
    {
      type: 'create_interaction',
      ref: 'decode',
      inputInteractions: [{ ref: 'message' }],
      fields: { title: 'Déchiffrer le message' },
      defaultTrigger: { ref: 'decodeChoice' },
    },
    {
      type: 'create_interaction',
      ref: 'ignore',
      inputInteractions: [{ ref: 'message' }],
      fields: { title: 'Ignorer le message' },
    },
    {
      type: 'create_interaction',
      ref: 'relay',
      inputInteractions: [{ ref: 'message' }],
      fields: { title: 'Relayer le message' },
      defaultTrigger: {
        conditionGroups: [{ conditions: [{ interactionId: rootId, hasBeenVisited: true }] }],
      },
    },
    {
      type: 'update_trigger',
      trigger: { ref: 'decodeChoice' },
      fields: {
        conditionGroups: [
          { conditions: [{ interactionId: { ref: 'message' }, hasBeenVisited: true }] },
        ],
      },
    },
  ];
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

function createdId(result: Record<string, unknown>, ref: string): string {
  const entity = createdSchema.parse(result.createdEntities).find((item) => item.ref === ref);
  if (entity === undefined) {
    throw new Error(`No created entity named ${ref}`);
  }
  return entity.id;
}

async function rootInteractionId(owner: McpSession) {
  const structure = await owner.ok('get_story_structure', { storyId });
  return {
    structure,
    rootId: z.array(idSchema).parse(structure.interactions)[0]?.id ?? '',
  };
}

it('previews a scene with three branches without changing the story', async () => {
  const owner = await mcp(accounts.owner);
  const listed = await owner.ok('list_stories', { query: title, filter: 'editable' });
  expect(listed).toMatchObject({ stories: [{ id: storyId, canEdit: true }] });
  const { structure, rootId } = await rootInteractionId(owner);
  expect(structure).toMatchObject({ story: { interactionCount: 2 }, consistentRevision: true });
  const before = await readStory(accounts.owner.token, storyId);

  const preview = await owner.ok('preview_story_changes', {
    storyId,
    operations: sceneOperations(rootId),
    expectedRevision: before.revision,
  });

  expect(preview).toMatchObject({
    valid: true,
    baseRevision: before.revision,
    summary: { counts: { interactionsAdded: 4, triggersAdded: 4, connectionsAdded: 4 } },
    diagnostics: [],
  });
  // The author can review the sanitized body and the conditions before confirming.
  const summary = JSON.stringify(preview.summary);
  expect(summary).toContain('Un message <strong>chiffré</strong>.');
  expect(summary).not.toContain('<script>');
  expect(summary).toContain('"field":"conditionGroups"');
  expect(await readStory(accounts.owner.token, storyId)).toEqual(before);
});

it('commits the confirmed scene in one revision that the editor reads and plays', async () => {
  const owner = await mcp(accounts.owner);
  const { rootId } = await rootInteractionId(owner);
  const before = await readStory(accounts.owner.token, storyId);
  const preview = await owner.ok('preview_story_changes', {
    storyId,
    operations: sceneOperations(rootId),
  });

  const commit = await owner.ok('commit_story_changes', {
    storyId,
    proposalId: preview.proposalId,
  });

  expect(commit).toMatchObject({ status: 'committed', revision: before.revision + 1 });
  const messageId = createdId(commit, 'message');
  const branchIds = ['decode', 'ignore', 'relay'].map((ref) => createdId(commit, ref));
  expect(await owner.ok('get_interaction', { storyId, interactionId: messageId })).toMatchObject({
    interaction: { body: '<p>Un message <strong>chiffré</strong>.</p>' },
    incomingTriggers: [{ inputInteractionIds: [rootId] }],
    outgoingConnections: branchIds.map((id) => ({ targetInteractionId: id })),
  });
  // The reader and Simulation runtime offers every branch whose conditions hold.
  expect(await runtimeOptions(messageId)).toEqual(expect.arrayContaining(branchIds));
  const exported = await rest(accounts.owner.token, 'GET', `/stories/${storyId}/export`);
  expect(exported.status).toBe(200);
  expect(JSON.stringify(exported.json)).toContain('Relayer le message');
  const history = await rest(accounts.owner.token, 'GET', `/stories/${storyId}/history`);
  expect(JSON.stringify(history.json)).toContain('story.changes.committed');
});

it('undoes and redoes the committed batch as one history entry', async () => {
  const before = await readStory(accounts.owner.token, storyId);
  const titles = () =>
    readStory(accounts.owner.token, storyId).then(({ interactions }) =>
      interactions.map((interaction) => interaction.title),
    );

  expect(
    (await rest(accounts.owner.token, 'POST', `/stories/${storyId}/history/undo`)).status,
  ).toBe(201);
  expect(await titles()).not.toContain('Le message crypté');
  expect(await titles()).toHaveLength(before.interactions.length - 4);

  expect(
    (await rest(accounts.owner.token, 'POST', `/stories/${storyId}/history/redo`)).status,
  ).toBe(201);
  expect(await titles()).toEqual(before.interactions.map((interaction) => interaction.title));
});

it('refuses a commit on a stale revision and answers a repeated commit once', async () => {
  const owner = await mcp(accounts.owner);
  const { rootId } = await rootInteractionId(owner);
  const operations = [
    { type: 'update_interaction', interaction: rootId, fields: { title: 'Station relais' } },
  ];
  const stale = await owner.ok('preview_story_changes', { storyId, operations });
  await rest(accounts.owner.token, 'PATCH', `/stories/${storyId}/interactions/${rootId}`, {
    durationMinutes: 5,
  });
  const conflict = await owner.call('commit_story_changes', {
    storyId,
    proposalId: stale.proposalId,
  });
  expect(conflict).toMatchObject({
    isError: true,
    data: { error: { code: 'STORY_REVISION_CONFLICT', status: 409 } },
  });

  const fresh = await owner.ok('preview_story_changes', { storyId, operations });
  const first = await owner.ok('commit_story_changes', { storyId, proposalId: fresh.proposalId });
  const retry = await owner.ok('commit_story_changes', { storyId, proposalId: fresh.proposalId });
  expect(retry).toMatchObject({ status: 'already_applied', revision: first.revision });
  expect((await readStory(accounts.owner.token, storyId)).revision).toBe(first.revision);
});

it('reports invalid references, including another story, as diagnostics', async () => {
  const owner = await mcp(accounts.owner);
  const foreign = await readStory(accounts.owner.token, otherStoryId);
  const result = await owner.ok('preview_story_changes', {
    storyId,
    operations: [
      { type: 'create_interaction', inputInteractions: [foreign.interactions[0]?.id] },
      { type: 'update_interaction', interaction: { ref: 'later' }, fields: { title: 'x' } },
    ],
  });
  expect(result).toMatchObject({
    valid: false,
    diagnostics: [{ operationIndex: 1, code: 'UNKNOWN_REFERENCE' }],
  });
  const crossStory = await owner.ok('preview_story_changes', {
    storyId,
    operations: [{ type: 'create_interaction', inputInteractions: [foreign.interactions[0]?.id] }],
  });
  expect(crossStory).toMatchObject({
    valid: false,
    diagnostics: [{ operationIndex: 0, code: 'INVALID_OPERATION' }],
  });
});

it('lets a viewer read but never preview or commit', async () => {
  const viewer = await mcp(accounts.viewer);
  const before = await readStory(accounts.owner.token, storyId);
  expect(await viewer.ok('get_story_structure', { storyId })).toMatchObject({
    story: { canEdit: false },
  });
  const preview = await viewer.call('preview_story_changes', {
    storyId,
    operations: [{ type: 'create_interaction', fields: { title: 'Intrusion' } }],
  });
  expect(preview).toMatchObject({ isError: true, data: { error: { status: 403 } } });
  expect((await readStory(accounts.owner.token, storyId)).revision).toBe(before.revision);
  // A grant on one story gives nothing on the owner's private story.
  const other = await viewer.call('get_story_structure', { storyId: otherStoryId });
  expect(other).toMatchObject({ isError: true, data: { error: { status: 404 } } });
});

it('hides private and invitation-only stories from users without a grant', async () => {
  const outsider = await mcp(accounts.outsider);
  expect(await outsider.ok('list_stories', { query: title })).toMatchObject({ stories: [] });
  const operations = [{ type: 'create_interaction', fields: { title: 'Intrusion' } }];
  const attempts = [
    ['get_story_structure', { storyId }],
    ['get_interaction', { storyId, interactionId: 'any' }],
    ['preview_story_changes', { storyId, operations }],
    ['get_story_structure', { storyId: otherStoryId }],
    ['preview_story_changes', { storyId: otherStoryId, operations }],
  ] as const;
  for (const [tool, args] of attempts) {
    expect(await outsider.call(tool, args)).toMatchObject({
      isError: true,
      data: { error: { status: 404 } },
    });
  }
});

// Run the API with PARALLEAX_STORY_QUOTA_INTERACTIONS set to the same small value.
(interactionQuota > 0 ? it : vitestIt.skip)(
  'checks the story quotas on the batch result',
  async () => {
    const owner = await mcp(accounts.owner);
    const quotaStoryId = await createStory('Quota story');
    // A new story has 2 interactions; the batch would exceed the quota by one.
    const operations = Array.from({ length: interactionQuota - 1 }, (_, index) => ({
      type: 'create_interaction',
      fields: { title: `Step ${index}` },
    }));
    const result = await owner.ok('preview_story_changes', { storyId: quotaStoryId, operations });
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        operationIndex: null,
        code: 'STORY_QUOTA_EXCEEDED',
      }),
    );
  },
);

it('serves preview and commit over stdio from the built server', async () => {
  // The same process and transport an MCP client such as Claude Code launches.
  const client = new Client({ name: 'paralleax-mcp-e2e-stdio', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../dist/main.js', import.meta.url))],
      env: {
        PATH: process.env.PATH ?? '',
        PARALLEAX_API_URL: e2eApiUrl ?? '',
        PARALLEAX_SESSION_TOKEN: accounts.owner.token,
      },
      stderr: 'ignore',
    }),
  );
  try {
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      return z.record(z.string(), z.unknown()).parse(result.structuredContent);
    };
    const before = await readStory(accounts.owner.token, storyId);
    const operations = [{ type: 'create_interaction', fields: { title: 'Écho stdio' } }];
    const preview = await call('preview_story_changes', {
      storyId,
      operations,
      expectedRevision: before.revision,
    });
    const commit = await call('commit_story_changes', { storyId, proposalId: preview.proposalId });
    expect(commit).toMatchObject({ status: 'committed', revision: before.revision + 1 });
  } finally {
    await client.close();
  }
});

it('rejects an invalid session', async () => {
  const anonymous = await mcp({ email: '', token: 'not-a-session' });
  expect(await anonymous.call('list_stories', {})).toMatchObject({
    isError: true,
    data: { error: { code: 'AUTHENTICATION_REQUIRED' } },
  });
});
