import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/runtime',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5175',
    launchOptions:
      process.env.PARALLEAX_CHROMIUM_PATH !== undefined &&
      process.env.PARALLEAX_CHROMIUM_PATH !== ''
        ? { executablePath: process.env.PARALLEAX_CHROMIUM_PATH }
        : {},
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
  },
});
