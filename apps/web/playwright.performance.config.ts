import { defineConfig, devices } from '@playwright/test';

const developmentPort = 5273;
const productionPort = 5274;

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: './test-results/performance',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: './playwright-report/performance' }],
  ],
  use: {
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${developmentPort} --strictPort`,
      url: `http://127.0.0.1:${developmentPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build && npx vite preview --host 127.0.0.1 --port ${productionPort} --strictPort`,
      url: `http://127.0.0.1:${productionPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'development',
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${developmentPort}` },
    },
    {
      name: 'production',
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${productionPort}` },
    },
  ],
});
