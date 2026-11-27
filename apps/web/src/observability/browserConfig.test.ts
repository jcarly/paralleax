import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

it('loads only known public fields before clients are created', async () => {
  vi.stubEnv('DEV', false);
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      sentryDsn: 'https://public@example.com/42',
      posthogProjectToken: 9,
      secret: 'hidden',
    }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const { loadBrowserConfig, getBrowserConfig } = await import('./browserConfig');
  await loadBrowserConfig();
  expect(getBrowserConfig()).toEqual({ sentryDsn: 'https://public@example.com/42' });
  expect(fetchMock).toHaveBeenCalledWith(
    '/runtime-config.json',
    expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
  );
});

it.each(['network', 'bad-json', 'missing'])('leaves monitoring disabled on %s', async (failure) => {
  vi.stubEnv('DEV', false);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      if (failure === 'network') {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve({
        ok: failure !== 'missing',
        json: () => Promise.reject(new Error('invalid')),
      });
    }),
  );
  const { loadBrowserConfig, getBrowserConfig } = await import('./browserConfig');
  await loadBrowserConfig();
  expect(getBrowserConfig()).toEqual({});
});

it('does not block startup when a response never completes', async () => {
  vi.stubEnv('DEV', false);
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
  const { loadBrowserConfig, getBrowserConfig } = await import('./browserConfig');
  const loading = loadBrowserConfig();
  await vi.advanceTimersByTimeAsync(3000);
  await loading;
  expect(getBrowserConfig()).toEqual({});
});

it('keeps the existing local survey default when only the token and host are set', async () => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'phc_local');
  vi.stubEnv('VITE_POSTHOG_API_HOST', 'http://localhost:8010');
  vi.stubEnv('VITE_POSTHOG_FEEDBACK_SURVEY_ID', '');
  const { getBrowserConfig, loadBrowserConfig } = await import('./browserConfig');
  await loadBrowserConfig();
  expect(getBrowserConfig().posthogFeedbackSurveyId).toBe('01a1f88c-830b-0000-a431-e0f5703c21fc');
});
