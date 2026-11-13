import { describe, expect, it } from 'vitest';
import { sentrySourceMapUploadConfig } from './sentry-build-config';

describe('Sentry source-map build configuration', () => {
  it('leaves source maps disabled when no upload secret is supplied', () => {
    expect(sentrySourceMapUploadConfig({})).toBeUndefined();
    expect(sentrySourceMapUploadConfig({ SENTRY_AUTH_TOKEN: '  ' })).toBeUndefined();
  });

  it('rejects incomplete upload credentials without returning the token', () => {
    expect(() => sentrySourceMapUploadConfig({ SENTRY_AUTH_TOKEN: 'secret-token' })).toThrow(
      'SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT must be configured together',
    );
  });

  it('enables upload and removes source maps after a successful upload', () => {
    expect(
      sentrySourceMapUploadConfig({
        SENTRY_AUTH_TOKEN: ' secret-token ',
        SENTRY_ORG: 'paralleax',
        SENTRY_PROJECT: 'web',
        SENTRY_URL: ' https://sentry.example.com/ ',
        VITE_SENTRY_RELEASE: ' 1.2.3 ',
      }),
    ).toEqual({
      authToken: 'secret-token',
      org: 'paralleax',
      project: 'web',
      url: 'https://sentry.example.com/',
      release: { name: '1.2.3' },
      telemetry: false,
      sourcemaps: { filesToDeleteAfterUpload: ['**/*.map'] },
    });
  });
});
