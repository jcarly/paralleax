#!/usr/bin/env node
// Reproducible demo: starts the built stdio server exactly as an MCP client
// would, reads a story, previews one batch (an encrypted message with three
// branches, two of them conditional), asks for confirmation, then commits it.
// Usage: node scripts/demo.mjs ["Story title"]   (after `npm run build` and `login`)
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const title = process.argv[2] ?? 'La dernière transmission';
const server = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
);
const client = new Client({ name: 'paralleax-mcp-demo', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env }));

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError === true) {
    throw new Error(`${name}: ${JSON.stringify(result.structuredContent)}`);
  }
  console.log(`\n→ ${name}`);
  return result.structuredContent;
}

try {
  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map(({ name }) => name).join(', ')}`);

  const { stories } = await call('list_stories', { query: title, filter: 'editable' });
  const story = stories[0];
  if (story === undefined) {
    throw new Error(`No editable story titled "${title}"; create it in the editor first.`);
  }
  console.log(`  ${story.title} (${story.id}), ${story.interactionCount} interactions`);

  const structure = await call('get_story_structure', { storyId: story.id });
  for (const interaction of structure.interactions) {
    console.log(`  - ${interaction.title || '(untitled)'} [${interaction.id}]`);
  }
  for (const trigger of structure.triggers) {
    console.log(
      `  ${trigger.inputInteractionIds.join(' | ') || '(start)'} → ${trigger.outputInteractionId}`,
    );
  }
  const [start] = structure.interactions;

  const operations = [
    {
      type: 'create_interaction',
      ref: 'message',
      inputInteractions: [start.id],
      fields: {
        title: 'Le message crypté',
        body: '<p>Sur l’écran de la station, une suite de symboles clignote : un message <strong>chiffré</strong>, envoyé il y a quarante ans.</p>',
      },
    },
    {
      type: 'create_interaction',
      ref: 'decode',
      inputInteractions: [{ ref: 'message' }],
      fields: {
        title: 'Déchiffrer le message',
        body: '<p>Vous sortez le vieux carnet de codes et commencez le déchiffrement.</p>',
      },
      defaultTrigger: {
        conditionGroups: [
          { conditions: [{ interactionId: { ref: 'message' }, hasBeenVisited: true }] },
        ],
      },
    },
    {
      type: 'create_interaction',
      ref: 'ignore',
      inputInteractions: [{ ref: 'message' }],
      fields: {
        title: 'Ignorer le message',
        body: '<p>Vous coupez l’écran. Certaines transmissions doivent rester perdues.</p>',
      },
    },
    {
      type: 'create_interaction',
      ref: 'relay',
      inputInteractions: [{ ref: 'message' }],
      fields: {
        title: 'Relayer le message',
        body: '<p>Vous renvoyez le signal vers la Terre, sans le lire.</p>',
      },
      defaultTrigger: {
        conditionGroups: [{ conditions: [{ interactionId: start.id, hasBeenVisited: true }] }],
        appearanceProbability: 50,
      },
    },
  ];

  const preview = await call('preview_story_changes', {
    storyId: story.id,
    operations,
    expectedRevision: structure.story.revision,
  });
  console.log(`  revision ${preview.baseRevision}, valid: ${preview.valid}`);
  for (const interaction of preview.summary?.interactions ?? []) {
    console.log(`  + ${interaction.title} (${interaction.ref ?? interaction.id})`);
  }
  for (const connection of preview.summary?.connections ?? []) {
    console.log(`  + ${connection.sourceInteractionId} → ${connection.targetInteractionId}`);
  }
  for (const diagnostic of preview.diagnostics) {
    console.log(`  ${diagnostic.severity}: ${diagnostic.message}`);
  }
  if (!preview.valid) {
    throw new Error('The preview is invalid; nothing was changed.');
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('\nApply these changes to the story? (yes/no) ');
  prompt.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Nothing was changed.');
  } else {
    const commit = await call('commit_story_changes', {
      storyId: story.id,
      proposalId: preview.proposalId,
    });
    const message = commit.createdEntities.find(({ ref }) => ref === 'message');
    const detail = await call('get_interaction', {
      storyId: story.id,
      interactionId: message.id,
    });
    console.log(
      `  leads to: ${detail.outgoingConnections.map(({ targetTitle }) => targetTitle).join(', ')}`,
    );
    console.log(
      `\nDone. Revision ${commit.revision}, one history entry: undo it from the editor history.`,
    );
  }
} finally {
  await client.close();
}
