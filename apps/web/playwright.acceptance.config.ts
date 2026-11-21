import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const externalBaseUrl = process.env.PARALLEAX_ACCEPTANCE_BASE_URL;
const apiPort = localPort(process.env.PARALLEAX_ACCEPTANCE_API_PORT, 3331);
const webPort = localPort(process.env.PARALLEAX_ACCEPTANCE_WEB_PORT, 5174);
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${webPort}`;
const repositoryRoot = resolve(import.meta.dirname, '../..');
const isCi = process.env.CI !== undefined && process.env.CI !== '';

export default defineConfig({
  testDir: './tests/acceptance',
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 1 : 0,
  // Fail fast: a stuck step used to wait for the whole test timeout (5 minutes, twice with the
  // retry) before reporting. Tests that need longer set their own timeout.
  maxFailures: isCi ? 3 : 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  outputDir: './test-results/acceptance',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report/acceptance' }]],
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command:
            'npm run build -w @paralleax/shared && npm run migrate -w @paralleax/api && npm run start -w @paralleax/api',
          cwd: repositoryRoot,
          env: {
            ...process.env,
            CORS_ORIGIN: `http://127.0.0.1:${webPort}`,
            DATABASE_URL:
              process.env.PARALLEAX_ACCEPTANCE_DATABASE_URL ??
              'postgres://paralleax:paralleax@127.0.0.1:5432/paralleax',
            NODE_ENV: 'test',
            PORT: String(apiPort),
            POSTGRES_SSL: 'false',
            REGISTRATION_MODE: 'open',
            TEST_AUTH_REGISTRATION_RATE_LIMIT: '100',
            TEST_EMAIL_OUTBOX: 'true',
          },
          url: `http://127.0.0.1:${apiPort}/api/ready`,
          reuseExistingServer: false,
          timeout: 240_000,
        },
        {
          command: `npm run dev -w @paralleax/web -- --host 127.0.0.1 --port ${webPort} --strictPort`,
          cwd: repositoryRoot,
          env: {
            ...process.env,
            VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
          },
          url: `http://127.0.0.1:${webPort}`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: 'real-stack-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

function localPort(value: string | undefined, fallback: number) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Acceptance server ports must be integers between 1 and 65535.');
  }
  return port;
}
