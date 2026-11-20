#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { ParalleaxApiClient } from './api-client.js';
import { apiUrlFromEnvironment, sessionFilePath } from './config.js';
import { login, logout, whoAmI } from './login.js';
import { createParalleaxMcpServer } from './server.js';
import { resolveSessionToken } from './session-store.js';
import { toolErrorPayload } from './tool-result.js';

const usage = `Usage: paralleax-mcp [serve|login|logout [--local-only]|status]
  serve   Run the MCP server on stdio (default).
  login   Sign in to Paralleax and store a session for the server.
  logout  Revoke the stored session on the API, then delete it.
          --local-only deletes the file even if the API cannot revoke it.
  status  Show which Paralleax user the server acts as.
Environment: PARALLEAX_API_URL (default http://localhost:3000/api),
  PARALLEAX_SESSION_TOKEN, PARALLEAX_MCP_SESSION_FILE.`;

function print(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function readPipedCredentials() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
  }
  const [email = '', password = ''] = input.split(/\r?\n/);
  return { email: email.trim(), password };
}

async function promptCredentials() {
  if (!process.stdin.isTTY) {
    return readPipedCredentials();
  }
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) {
        process.stderr.write(chunk);
      }
      callback();
    },
  });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const email = (await prompt.question('Paralleax email: ')).trim();
    process.stderr.write('Password: ');
    muted = true;
    const password = await prompt.question('');
    muted = false;
    process.stderr.write('\n');
    return { email, password };
  } finally {
    prompt.close();
  }
}

async function apiClient(): Promise<ParalleaxApiClient> {
  const apiUrl = apiUrlFromEnvironment();
  const sessionToken = await resolveSessionToken(apiUrl, process.env, sessionFilePath());
  return new ParalleaxApiClient({ apiUrl, sessionToken });
}

async function serve(): Promise<void> {
  const server = createParalleaxMcpServer({ api: await apiClient() });
  await server.connect(new StdioServerTransport());
  print('Paralleax MCP server ready on stdio');
}

const commands = new Map<string, () => Promise<void>>([
  ['serve', serve],
  [
    'login',
    async () => {
      const credentials = await promptCredentials();
      const user = await login(apiUrlFromEnvironment(), credentials, sessionFilePath());
      print(`Signed in as ${user.displayName}. Session stored in ${sessionFilePath()}`);
      if (process.platform === 'win32') {
        print(
          'Windows: the file is protected only by your user profile permissions; mode 0600 is not enforced.',
        );
      }
    },
  ],
  [
    'logout',
    async () => {
      const localOnly = process.argv.includes('--local-only');
      const revoked = await logout(sessionFilePath(), { localOnly });
      print(
        revoked || !localOnly
          ? 'Signed out.'
          : 'Session file deleted. The session stays valid on the API until it expires or you sign out other sessions from the Paralleax account menu.',
      );
    },
  ],
  [
    'status',
    async () => {
      const user = await whoAmI(await apiClient());
      print(`The MCP server acts as ${user.displayName} (${user.id}).`);
    },
  ],
]);

const command = commands.get(process.argv[2] ?? 'serve');
if (command === undefined) {
  print(usage);
  process.exitCode = 2;
} else {
  command().catch((error: unknown) => {
    const { code, message } = toolErrorPayload(error);
    print(`paralleax-mcp: ${code}: ${message}`);
    process.exitCode = 1;
  });
}
