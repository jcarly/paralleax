import { loadAppConfig } from './app-config.service';

describe('AppConfigService', () => {
  it('provides validated local defaults', () => {
    const config = loadAppConfig({});
    expect(config).toMatchObject({
      databaseUrl: 'postgres://paralleax:paralleax@localhost:5432/paralleax',
      postgresSsl: false,
      port: 3000,
      corsOrigin: 'http://localhost:5173',
      nodeEnvironment: 'development',
      registrationMode: 'open',
      authRegistrationRateLimit: 5,
      testEmailOutbox: false,
      emailSmtpUrl: undefined,
      emailFrom: undefined,
      emailReplyTo: undefined,
    });
    expect(config.nodeEnvironment).toBe('development');
  });

  it('allows test-only configuration only in the test environment', () => {
    expect(
      loadAppConfig({
        NODE_ENV: 'test',
        TEST_AUTH_REGISTRATION_RATE_LIMIT: '100',
        TEST_EMAIL_OUTBOX: 'true',
      }).authRegistrationRateLimit,
    ).toBe(100);
    expect(loadAppConfig({ NODE_ENV: 'test', TEST_EMAIL_OUTBOX: 'true' }).testEmailOutbox).toBe(
      true,
    );
    expect(
      loadAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db/app',
        CORS_ORIGIN: 'https://app.example.com',
        REGISTRATION_MODE: 'closed',
        TEST_AUTH_REGISTRATION_RATE_LIMIT: '100',
      }).authRegistrationRateLimit,
    ).toBe(5);
    expect(() =>
      loadAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db/app',
        CORS_ORIGIN: 'https://app.example.com',
        REGISTRATION_MODE: 'closed',
        TEST_EMAIL_OUTBOX: 'true',
      }),
    ).toThrow('TEST_EMAIL_OUTBOX is only available in the test environment');
  });

  it('normalizes optional configuration and enables production cookies', () => {
    const config = loadAppConfig({
      DATABASE_URL: 'postgresql://user:password@db:5432/app',
      POSTGRES_SSL: 'true',
      PORT: '8080',
      CORS_ORIGIN: 'https://app.example.com',
      NODE_ENV: 'production',
      POSTGRES_SSL_CA: 'certificate\\nline',
      REGISTRATION_MODE: 'access-code',
      REGISTRATION_ACCESS_CODE: 'correct-alpha-code',
    });
    expect(config).toMatchObject({
      postgresSsl: true,
      port: 8080,
      postgresSslCa: 'certificate\nline',
      corsOrigin: 'https://app.example.com',
      registrationMode: 'access-code',
    });
    expect(config.nodeEnvironment).toBe('production');
  });

  it('accepts a complete SMTP delivery configuration', () => {
    expect(
      loadAppConfig({
        EMAIL_SMTP_URL: 'smtps://user:secret@smtp.example.com:465',
        EMAIL_FROM: 'Paralleax <no-reply@example.com>',
        EMAIL_REPLY_TO: 'support@example.com',
      }),
    ).toMatchObject({
      emailSmtpUrl: 'smtps://user:secret@smtp.example.com:465',
      emailFrom: 'Paralleax <no-reply@example.com>',
      emailReplyTo: 'support@example.com',
    });
  });

  it.each([
    [{ DATABASE_URL: 'invalid' }, 'DATABASE_URL must be a valid URL'],
    [{ DATABASE_URL: 'https://example.com' }, 'DATABASE_URL must use postgres: or postgresql:'],
    [{ CORS_ORIGIN: 'ftp://example.com' }, 'CORS_ORIGIN must use http: or https:'],
    [{ CORS_ORIGIN: 'https://example.com/app' }, 'CORS_ORIGIN must contain only an http(s) origin'],
    [{ PORT: '70000' }, 'PORT must be an integer between 1 and 65535'],
    [
      { NODE_ENV: 'test', TEST_AUTH_REGISTRATION_RATE_LIMIT: '0' },
      'TEST_AUTH_REGISTRATION_RATE_LIMIT must be an integer between 1 and 10000',
    ],
    [{ POSTGRES_SSL: 'yes' }, 'POSTGRES_SSL must be true or false'],
    [{ TEST_EMAIL_OUTBOX: 'yes' }, 'TEST_EMAIL_OUTBOX must be true or false'],
    [{ EMAIL_SMTP_URL: 'https://smtp.example.com' }, 'EMAIL_SMTP_URL must use smtp: or smtps:'],
    [
      { EMAIL_SMTP_URL: 'smtp://smtp.example.com' },
      'EMAIL_SMTP_URL and EMAIL_FROM must be configured together',
    ],
    [
      { EMAIL_FROM: 'no-reply@example.com' },
      'EMAIL_SMTP_URL and EMAIL_FROM must be configured together',
    ],
    [
      { EMAIL_FROM: 'no-reply@example.com\r\nBcc: attacker@example.com' },
      'EMAIL_FROM must not contain a line break',
    ],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV must be one of'],
    [{ REGISTRATION_MODE: 'invite' }, 'REGISTRATION_MODE must be one of'],
    [
      { REGISTRATION_MODE: 'access-code', REGISTRATION_ACCESS_CODE: 'short' },
      'REGISTRATION_ACCESS_CODE must contain at least 16 characters',
    ],
  ])('rejects invalid environment values', (environment, message) => {
    expect(() => loadAppConfig(environment)).toThrow(message);
  });

  it('requires explicit external endpoints in production', () => {
    expect(() => loadAppConfig({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL is required in production',
    );
    expect(() =>
      loadAppConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db/app' }),
    ).toThrow('CORS_ORIGIN is required in production');
    expect(() =>
      loadAppConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db/app',
        CORS_ORIGIN: 'https://app.example.com',
      }),
    ).toThrow('REGISTRATION_MODE is required in production');
  });
});
