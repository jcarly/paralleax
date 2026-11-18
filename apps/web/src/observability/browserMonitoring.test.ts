import { afterEach, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  initializeSentry: vi.fn(),
  captureBrowserException: vi.fn(),
}));

vi.mock('./sentry', () => ({
  browserSentryConfig: { dsn: 'https://public@o123.ingest.sentry.io/42' },
  initializeSentry: sentryMocks.initializeSentry,
  captureBrowserException: sentryMocks.captureBrowserException,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

it('does not load Sentry when the browser DSN is absent', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', '');
  const { reportBrowserError, startBrowserMonitoring } = await import('./browserMonitoring');

  expect(await startBrowserMonitoring()).toBeNull();
  reportBrowserError(new Error('offline'), 'route-error');
  await Promise.resolve();

  expect(sentryMocks.initializeSentry).not.toHaveBeenCalled();
  expect(sentryMocks.captureBrowserException).not.toHaveBeenCalled();
});

it('initializes Sentry once and reports route errors after initialization', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o123.ingest.sentry.io/42');
  const { reportBrowserError, startBrowserMonitoring } = await import('./browserMonitoring');
  await Promise.all([startBrowserMonitoring(), startBrowserMonitoring()]);

  const error = new Error('Failed to fetch dynamically imported module');
  reportBrowserError(error, 'dynamic-import');

  await vi.waitFor(() => {
    expect(sentryMocks.captureBrowserException).toHaveBeenCalledWith(error, 'dynamic-import');
  });
  expect(sentryMocks.initializeSentry).toHaveBeenCalledOnce();
});

it('does not break the app when Sentry initialization fails', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@o123.ingest.sentry.io/42');
  const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  sentryMocks.initializeSentry.mockImplementationOnce(() => {
    throw new Error('Sentry unavailable');
  });
  const { startBrowserMonitoring } = await import('./browserMonitoring');

  expect(await startBrowserMonitoring()).toBeNull();
  expect(logger).toHaveBeenCalledWith(
    'Sentry monitoring could not be initialized',
    expect.any(Error),
  );
});
