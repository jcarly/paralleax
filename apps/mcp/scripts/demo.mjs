#!/usr/bin/env node
// Reproducible demo: starts the built stdio server exactly as an MCP client
// would, then reads a story, adds an encrypted-message interaction with two
// branches and connects one branch to an existing interaction.
// Usage: node scripts/demo.mjs ["Story title"]   (after `npm run build` and `login`)
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
  const [start, existing] = structure.interactions;

  const message = await call('create_interaction', {
    storyId: story.id,
    title: 'Le message crypté',
    body: '<p>Sur l’écran de la station, une suite de symboles clignote : un message <strong>chiffré</strong>, envoyé il y a quarante ans.</p>',
    parentInteractionId: start.id,
  });
  console.log(
    `  created ${message.interaction.id} at (${message.interaction.position.x}, ${message.interaction.position.y})`,
  );

  const branches = [];
  for (const [branchTitle, body] of [
    [
      'Déchiffrer le message',
      '<p>Vous sortez le vieux carnet de codes et commencez le déchiffrement.</p>',
    ],
    [
      'Ignorer le message',
      '<p>Vous coupez l’écran. Certaines transmissions doivent rester perdues.</p>',
    ],
  ]) {
    const branch = await call('create_interaction', {
      storyId: story.id,
      title: branchTitle,
      body,
      parentInteractionId: message.interaction.id,
    });
    branches.push(branch.interaction);
    console.log(`  branch ${branch.interaction.title} [${branch.interaction.id}]`);
  }

  if (existing !== undefined) {
    const connection = await call('create_trigger', {
      storyId: story.id,
      targetInteractionId: existing.id,
      inputInteractionIds: [branches[0].id],
    });
    console.log(
      `  ${branches[0].title} → ${existing.title || existing.id} (trigger ${connection.trigger.id})`,
    );
  }

  const detail = await call('get_interaction', {
    storyId: story.id,
    interactionId: message.interaction.id,
  });
  console.log(
    `  leads to: ${detail.outgoingConnections.map(({ targetTitle }) => targetTitle).join(', ')}`,
  );
  console.log(
    `\nDone. Revision ${detail.revision}. Open the story in the editor to see the new branch.`,
  );
} finally {
  await client.close();
}
