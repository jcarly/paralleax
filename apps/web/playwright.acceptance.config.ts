import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const externalBaseUrl = process.env.PARALLEAX_ACCEPTANCE_BASE_URL;
const baseURL = externalBaseUrl ?? 'http://127.0.0.1:5173';
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
            CORS_ORIGIN: 'http://127.0.0.1:5173',
            DATABASE_URL:
              process.env.PARALLEAX_ACCEPTANCE_DATABASE_URL ??
              'postgres://paralleax:paralleax@127.0.0.1:5432/paralleax',
            NODE_ENV: 'test',
            PORT: '3300',
            POSTGRES_SSL: 'false',
            REGISTRATION_ACCESS_CODE: accessCode,
            REGISTRATION_MODE: 'access-code',
          },
          url: 'http://127.0.0.1:3300/api/ready',
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
        },
        {
          command: 'npm run dev -w @paralleax/web -- --host 127.0.0.1',
          cwd: repositoryRoot,
          env: {
            ...process.env,
            VITE_API_PROXY_TARGET: 'http://127.0.0.1:3300',
          },
          url: 'http://127.0.0.1:5173',
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
