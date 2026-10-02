import { Injectable } from '@nestjs/common';

export type NodeEnvironment = 'development' | 'test' | 'production';
export type RegistrationMode = 'open' | 'access-code' | 'closed';

@Injectable()
export class AppConfigService {
  readonly databaseUrl!: string;
  readonly postgresSsl!: boolean;
  readonly port!: number;
  readonly corsOrigin!: string;
  readonly nodeEnvironment!: NodeEnvironment;
  readonly postgresSslCa?: string;
  readonly registrationMode!: RegistrationMode;
  readonly registrationAccessCode?: string;
  readonly authRegistrationRateLimit!: number;
  readonly testEmailOutbox!: boolean;
  readonly emailSmtpUrl?: string;
  readonly emailFrom?: string;
  readonly emailReplyTo?: string;

  constructor() {
    Object.assign(this, loadAppConfig(process.env));
  }

  get secureCookies() {
    return this.nodeEnvironment === 'production';
  }
}

export function loadAppConfig(environment: NodeJS.ProcessEnv) {
  const nodeEnvironment = enumValue('NODE_ENV', environment.NODE_ENV ?? 'development', [
    'development',
    'test',
    'production',
  ] as const);
  if (nodeEnvironment === 'production' && !environment.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (nodeEnvironment === 'production' && !environment.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN is required in production');
  }
  if (nodeEnvironment === 'production' && !environment.REGISTRATION_MODE) {
    throw new Error('REGISTRATION_MODE is required in production');
  }
  const registrationMode = enumValue('REGISTRATION_MODE', environment.REGISTRATION_MODE ?? 'open', [
    'open',
    'access-code',
    'closed',
  ] as const);
  const registrationAccessCode = environment.REGISTRATION_ACCESS_CODE;
  if (
    registrationMode === 'access-code' &&
    (!registrationAccessCode || registrationAccessCode.length < 16)
  ) {
    throw new Error(
      'REGISTRATION_ACCESS_CODE must contain at least 16 characters in access-code mode',
    );
  }
  const authRegistrationRateLimit =
    nodeEnvironment === 'test'
      ? integerValue(
          'TEST_AUTH_REGISTRATION_RATE_LIMIT',
          environment.TEST_AUTH_REGISTRATION_RATE_LIMIT ?? '5',
          1,
          10_000,
        )
      : 5;
  const testEmailOutbox = booleanValue(
    'TEST_EMAIL_OUTBOX',
    environment.TEST_EMAIL_OUTBOX ?? 'false',
  );
  if (testEmailOutbox && nodeEnvironment !== 'test') {
    throw new Error('TEST_EMAIL_OUTBOX is only available in the test environment');
  }
  const emailSmtpUrl = optionalSmtpUrl(environment.EMAIL_SMTP_URL);
  const emailFrom = optionalEmailHeaderValue('EMAIL_FROM', environment.EMAIL_FROM);
  const emailReplyTo = optionalEmailHeaderValue('EMAIL_REPLY_TO', environment.EMAIL_REPLY_TO);
  if (Boolean(emailSmtpUrl) !== Boolean(emailFrom)) {
    throw new Error('EMAIL_SMTP_URL and EMAIL_FROM must be configured together');
  }
  return {
    nodeEnvironment,
    databaseUrl: validUrl(
      'DATABASE_URL',
      environment.DATABASE_URL ?? 'postgres://paralleax:paralleax@localhost:5432/paralleax',
      ['postgres:', 'postgresql:'],
    ),
    corsOrigin: validOrigin(environment.CORS_ORIGIN ?? 'http://localhost:5173'),
    port: validPort(environment.PORT ?? '3000'),
    postgresSsl: booleanValue('POSTGRES_SSL', environment.POSTGRES_SSL ?? 'false'),
    postgresSslCa: environment.POSTGRES_SSL_CA?.replace(/\\n/g, '\n'),
    registrationMode,
    registrationAccessCode: registrationMode === 'access-code' ? registrationAccessCode : undefined,
    authRegistrationRateLimit,
    testEmailOutbox,
    emailSmtpUrl,
    emailFrom,
    emailReplyTo,
  };
}

function validOrigin(value: string) {
  const validated = validUrl('CORS_ORIGIN', value, ['http:', 'https:']);
  const url = new URL(validated);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('CORS_ORIGIN must contain only an http(s) origin');
  }
  return url.origin;
}

function validUrl(name: string, value: string, protocols: string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use ${protocols.join(' or ')}`);
  }
  return value;
}

function validPort(value: string) {
  return integerValue('PORT', value, 1, 65_535);
}

function integerValue(name: string, value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function booleanValue(name: string, value: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function optionalSmtpUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const url = validUrl('EMAIL_SMTP_URL', normalized, ['smtp:', 'smtps:']);
  if (!new URL(url).hostname) {
    throw new Error('EMAIL_SMTP_URL must include an SMTP hostname');
  }
  return url;
}

function optionalEmailHeaderValue(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${name} must not contain a line break`);
  }
  return normalized;
}

function enumValue<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
}
