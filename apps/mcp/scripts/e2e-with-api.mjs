#!/usr/bin/env node
// Runs the MCP end-to-end spec against a real API process and PostgreSQL.
// Requires the built API (npm run build -w @paralleax/api) and
// MCP_E2E_DATABASE_URL pointing at a dedicated database whose name ends with
// "_test": the script migrates it and creates accounts and stories in it.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.MCP_E2E_DATABASE_URL ?? '';
const port = process.env.MCP_E2E_API_PORT ?? '3100';
const interactionQuota = '12';
const apiMain = fileURLToPath(new URL('../../api/dist/main.js', import.meta.url));
const mcpRoot = fileURLToPath(new URL('..', import.meta.url));
const apiUrl = `http://127.0.0.1:${port}/api`;

function databaseNameOf(url) {
  try {
    return new URL(url).pathname.slice(1);
  } catch {
    return '';
  }
}
const databaseName = databaseNameOf(databaseUrl);
if (!/_test$/i.test(databaseName)) {
  console.error('MCP_E2E_DATABASE_URL must name a dedicated database ending with "_test".');
  process.exit(2);
}

const apiEnvironment = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: databaseUrl,
  PORT: port,
  CORS_ORIGIN: 'http://localhost:5173',
  REGISTRATION_MODE: 'open',
  DEV_SKIP_EMAIL_VERIFICATION: 'true',
  PARALLEAX_STORY_QUOTA_INTERACTIONS: interactionQuota,
};

async function run(command, args, options) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  const [code] = await once(child, 'exit');
  return code ?? 1;
}

async function waitForHealth(api) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api.exitCode !== null) {
      throw new Error(`The API exited with code ${api.exitCode}`);
    }
    try {
      if ((await fetch(`${apiUrl}/health`)).ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await delay(500);
  }
  throw new Error('The API did not become healthy in 30 seconds');
}

if ((await run(process.execPath, [apiMain, '--migrate'], { env: apiEnvironment })) !== 0) {
  process.exit(1);
}
const api = spawn(process.execPath, [apiMain], { env: apiEnvironment, stdio: 'inherit' });
let exitCode = 1;
try {
  await waitForHealth(api);
  exitCode = await run(
    'npx',
    ['vitest', 'run', '--configLoader', 'runner', 'src/mcp.e2e.test.ts'],
    {
      cwd: mcpRoot,
      env: {
        ...process.env,
        PARALLEAX_MCP_E2E_API_URL: apiUrl,
        PARALLEAX_MCP_E2E_INTERACTION_QUOTA: interactionQuota,
      },
    },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  api.kill('SIGTERM');
  await once(api, 'exit');
}
process.exit(exitCode);
