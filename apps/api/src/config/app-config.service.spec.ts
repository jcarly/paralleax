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
    });
    expect(config.nodeEnvironment).toBe('development');
  });

  it('normalizes optional configuration and enables production cookies', () => {
    const config = loadAppConfig({
      DATABASE_URL: 'postgresql://user:password@db:5432/app',
      POSTGRES_SSL: 'true',
      PORT: '8080',
      CORS_ORIGIN: 'https://app.example.com',
      NODE_ENV: 'production',
      LEGACY_STORY_OWNER_EMAIL: ' Owner@Example.com ',
    });
    expect(config).toMatchObject({
      postgresSsl: true,
      port: 8080,
      legacyStoryOwnerEmail: 'owner@example.com',
    });
    expect(config.nodeEnvironment).toBe('production');
  });

  it.each([
    [{ DATABASE_URL: 'invalid' }, 'DATABASE_URL must be a valid URL'],
    [{ DATABASE_URL: 'https://example.com' }, 'DATABASE_URL must use postgres: or postgresql:'],
    [{ CORS_ORIGIN: 'ftp://example.com' }, 'CORS_ORIGIN must use http: or https:'],
    [{ PORT: '70000' }, 'PORT must be an integer between 1 and 65535'],
    [{ POSTGRES_SSL: 'yes' }, 'POSTGRES_SSL must be true or false'],
    [{ NODE_ENV: 'staging' }, 'NODE_ENV must be one of'],
    [{ LEGACY_STORY_OWNER_EMAIL: 'invalid' }, 'must be a valid email address'],
  ])('rejects invalid environment values', (environment, message) => {
    expect(() => loadAppConfig(environment)).toThrow(message);
  });
});
