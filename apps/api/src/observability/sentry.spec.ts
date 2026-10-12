const originalEnvironment = {
  nodeEnv: process.env.NODE_ENV,
  sentryDsn: process.env.SENTRY_DSN,
  sentryRelease: process.env.SENTRY_RELEASE,
  sentryTracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
};

function setEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

afterEach(() => {
  setEnvironmentValue('NODE_ENV', originalEnvironment.nodeEnv);
  setEnvironmentValue('SENTRY_DSN', originalEnvironment.sentryDsn);
  setEnvironmentValue('SENTRY_RELEASE', originalEnvironment.sentryRelease);
  setEnvironmentValue('SENTRY_TRACES_SAMPLE_RATE', originalEnvironment.sentryTracesSampleRate);
  jest.dontMock('@sentry/nestjs');
  jest.resetModules();
});

describe('Sentry observability', () => {
  it('removes request and exception details from Sentry events', () => {
    setEnvironmentValue('NODE_ENV', 'test');
    setEnvironmentValue('SENTRY_DSN', undefined);
    const { redactSentryEvent } = require('./sentry') as typeof import('./sentry');
    const event = {
      request: { cookies: 'secret' },
      user: { email: 'author@example.com' },
      extra: { password: 'secret' },
      contexts: { device: { name: 'laptop' } },
      breadcrumbs: [{ message: 'sensitive request breadcrumb' }],
      exception: {
        values: [
          {
            value: 'database password',
            stacktrace: {
              frames: [
                {
                  filename: 'stories.service.ts',
                  context_line: 'throw error',
                  pre_context: ['password=secret'],
                  post_context: ['return'],
                  vars: { password: 'secret' },
                },
              ],
            },
          },
        ],
      },
    };

    expect(redactSentryEvent(event)).toEqual({
      breadcrumbs: [],
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'stories.service.ts' }],
            },
          },
        ],
      },
    });
  });

  it('initializes and records only safe API metadata when enabled', () => {
    const init = jest.fn();
    const setTags = jest.fn();
    const captureException = jest.fn();
    const withScope = jest.fn((callback: (scope: { setTags: typeof setTags }) => void) => {
      callback({ setTags });
    });
    jest.doMock('@sentry/nestjs', () => ({ init, withScope, captureException }));
    setEnvironmentValue('NODE_ENV', 'production');
    setEnvironmentValue('SENTRY_DSN', 'https://public-key@example.ingest.sentry.io/123');
    setEnvironmentValue('SENTRY_RELEASE', 'test-release');
    setEnvironmentValue('SENTRY_TRACES_SAMPLE_RATE', '0.25');

    let captureApiException: typeof import('./sentry').captureApiException | undefined;
    jest.isolateModules(() => {
      ({ captureApiException } = require('./sentry') as typeof import('./sentry'));
    });
    if (!captureApiException) throw new Error('Expected Sentry capture function to be available');

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public-key@example.ingest.sentry.io/123',
        environment: 'production',
        release: 'test-release',
        tracesSampleRate: 0.25,
        includeServerName: false,
        maxBreadcrumbs: 0,
      }),
    );

    const exception = new Error('private error detail');
    captureApiException(exception, {
      requestId: 'request-1',
      method: 'POST',
      status: 503,
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
    });

    expect(withScope).toHaveBeenCalledTimes(1);
    expect(setTags).toHaveBeenCalledWith({
      request_id: 'request-1',
      'http.method': 'POST',
      'http.status_code': '503',
      'paralleax.error_code': 'EMAIL_DELIVERY_UNAVAILABLE',
    });
    expect(captureException).toHaveBeenCalledWith(exception);
  });
});
