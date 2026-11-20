import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: process.env.CI === undefined || process.env.CI === '',
      timeout: 120_000,
    },
    {
      // Same app with a test PostHog configuration, so that the feedback
      // button exists only for the feedback specs.
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: process.env.CI === undefined || process.env.CI === '',
      timeout: 120_000,
      env: {
        VITE_POSTHOG_PROJECT_TOKEN: 'phc_e2e_test_token',
        VITE_POSTHOG_API_HOST: 'https://eu.i.posthog.com',
        VITE_POSTHOG_FEEDBACK_SURVEY_ID: 'survey-e2e',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      testIgnore: /feedback\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'feedback-desktop',
      testMatch: /feedback\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5174' },
    },
    {
      name: 'feedback-mobile',
      testMatch: /feedback\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:5174' },
    },
  ],
});
