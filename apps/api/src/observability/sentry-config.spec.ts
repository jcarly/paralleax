import { loadSentryConfig } from './sentry-config';

describe('Sentry configuration', () => {
  it('is disabled unless a DSN is configured', () => {
    expect(loadSentryConfig({})).toEqual({});
  });

  it('accepts a safe optional Sentry configuration', () => {
    expect(
      loadSentryConfig({
        SENTRY_DSN: 'https://public-key@example.ingest.sentry.io/123',
        SENTRY_RELEASE: 'git-commit',
        SENTRY_TRACES_SAMPLE_RATE: '0.1',
      }),
    ).toEqual({
      dsn: 'https://public-key@example.ingest.sentry.io/123',
      release: 'git-commit',
      tracesSampleRate: 0.1,
    });
  });

  it.each([
    [{ SENTRY_DSN: 'not-a-url' }, 'SENTRY_DSN must be a valid http(s) Sentry DSN'],
    [
      { SENTRY_DSN: 'https://example.ingest.sentry.io/' },
      'SENTRY_DSN must be a valid http(s) Sentry DSN',
    ],
    [
      { SENTRY_TRACES_SAMPLE_RATE: '-0.1' },
      'SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1',
    ],
    [
      { SENTRY_TRACES_SAMPLE_RATE: '1.1' },
      'SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1',
    ],
    [{ SENTRY_RELEASE: 'release\nname' }, 'SENTRY_RELEASE must contain at most 200 characters'],
  ])('rejects unsafe configuration', (environment, message) => {
    expect(() => loadSentryConfig(environment)).toThrow(message);
  });
});
