import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const externalBaseUrl = process.env.PARALLEAX_ACCEPTANCE_BASE_URL;
const apiPort = localPort(process.env.PARALLEAX_ACCEPTANCE_API_PORT, 3300);
const webPort = localPort(process.env.PARALLEAX_ACCEPTANCE_WEB_PORT, 5173);
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${webPort}`;
const repositoryRoot = resolve(import.meta.dirname, '../..');
const accessCode = process.env.PARALLEAX_ACCEPTANCE_ACCESS_CODE ?? 'playwright-alpha-access-code';

export default defineConfig({
  testDir: './tests/acceptance',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  outputDir: './test-results/acceptance',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './playwright-report/acceptance' }]],
  use: {
    baseURL,
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
            REGISTRATION_ACCESS_CODE: accessCode,
            REGISTRATION_MODE: 'access-code',
            TEST_AUTH_REGISTRATION_RATE_LIMIT: '100',
          },
          url: `http://127.0.0.1:${apiPort}/api/ready`,
          reuseExistingServer: !process.env.CI,
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
          reuseExistingServer: !process.env.CI,
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
