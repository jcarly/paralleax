import { describe, expect, it } from 'vitest';
import { parseBrowserSentryConfig, redactSentryEvent } from './sentry';

describe('browser Sentry configuration', () => {
  it('stays disabled until a valid public DSN is configured', () => {
    expect(parseBrowserSentryConfig(undefined, undefined, undefined)).toBeNull();
    expect(parseBrowserSentryConfig('not-a-url', undefined, undefined)).toBeNull();
  });

  it('parses a privacy-safe configuration', () => {
    expect(
      parseBrowserSentryConfig(
        'https://public-key@example.ingest.sentry.io/123',
        'git-commit',
        '0.1',
      ),
    ).toEqual({
      dsn: 'https://public-key@example.ingest.sentry.io/123',
      release: 'git-commit',
      tracesSampleRate: 0.1,
    });
  });

  it('removes user content and request data from captured events', () => {
    const event = redactSentryEvent({
      request: { data: 'story body' },
      user: { email: 'author@example.com' },
      extra: { token: 'secret' },
      contexts: { story: { title: 'Private story' } },
      breadcrumbs: [{ message: 'editor content' }],
      exception: {
        values: [
          {
            value: 'private error message',
            stacktrace: {
              frames: [
                {
                  context_line: 'const password = secret',
                  pre_context: ['private'],
                  post_context: ['private'],
                  vars: { password: 'secret' },
                },
              ],
            },
          },
        ],
      },
    });

    expect(event).toMatchObject({
      breadcrumbs: [],
      exception: { values: [{ stacktrace: { frames: [{}] } }] },
    });
    expect(JSON.stringify(event)).not.toMatch(/story body|author@example|secret|private/i);
  });
});
