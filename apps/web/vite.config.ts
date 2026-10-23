import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath } from 'node:url';

const sentrySourceMapUpload = sentrySourceMapUploadConfig(process.env);

export default defineConfig({
  plugins: [react(), ...(sentrySourceMapUpload ? [sentryVitePlugin(sentrySourceMapUpload)] : [])],
  build: {
    minify: 'terser',
    manifest: true,
    sourcemap: Boolean(sentrySourceMapUpload),
  },
  test: {
    environment: 'jsdom',
    maxWorkers: 4,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/pages/ParalleaxPrototype*.test.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/pages/ParalleaxPrototype*',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      thresholds: {
        branches: 80,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@paralleax/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
});

function sentrySourceMapUploadConfig(environment: NodeJS.ProcessEnv) {
  const authToken = environment.SENTRY_AUTH_TOKEN?.trim();
  const org = environment.SENTRY_ORG?.trim();
  const project = environment.SENTRY_PROJECT?.trim();
  const configured = [authToken, org, project].filter(Boolean).length;
  if (configured > 0 && configured < 3) {
    throw new Error(
      'SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT must be configured together',
    );
  }
  if (!authToken || !org || !project) return undefined;
  const release = environment.VITE_SENTRY_RELEASE?.trim();
  return {
    authToken,
    org,
    project,
    ...(environment.SENTRY_URL?.trim() ? { url: environment.SENTRY_URL.trim() } : {}),
    ...(release ? { release: { name: release } } : {}),
    telemetry: false,
    sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
  };
}
