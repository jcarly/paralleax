import { Injectable } from '@nestjs/common';

export type NodeEnvironment = 'development' | 'test' | 'production';
export type RegistrationMode = 'open' | 'closed';
export interface EmailAddress {
  email: string;
  name?: string;
}

@Injectable()
export class AppConfigService {
  readonly databaseUrl!: string;
  readonly postgresSsl!: boolean;
  readonly port!: number;
  readonly corsOrigin!: string;
  readonly nodeEnvironment!: NodeEnvironment;
  readonly postgresSslCa?: string;
  readonly registrationMode!: RegistrationMode;
  readonly authRegistrationRateLimit!: number;
  readonly testEmailOutbox!: boolean;
  readonly devSkipEmailVerification!: boolean;
  readonly brevoApiKey?: string;
  readonly emailFrom?: EmailAddress;
  readonly emailReplyTo?: EmailAddress;

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
  assertRequiredProductionSettings(nodeEnvironment, environment);
  assertSupportedRegistrationConfiguration(environment);
  const registrationMode = enumValue('REGISTRATION_MODE', environment.REGISTRATION_MODE ?? 'open', [
    'open',
    'closed',
  ] as const);
  const authRegistrationRateLimit = registrationRateLimit(nodeEnvironment, environment);
  const testEmailOutbox = testEmailOutboxEnabled(nodeEnvironment, environment);
  const devSkipEmailVerification = devEmailVerificationSkipEnabled(nodeEnvironment, environment);
  const emailConfiguration = loadEmailConfiguration(environment);
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
    authRegistrationRateLimit,
    testEmailOutbox,
    devSkipEmailVerification,
    ...emailConfiguration,
  };
}

function assertRequiredProductionSettings(
  nodeEnvironment: NodeEnvironment,
  environment: NodeJS.ProcessEnv,
) {
  if (nodeEnvironment !== 'production') {
    return;
  }
  const requiredSettings: Array<[string, string | undefined]> = [
    ['DATABASE_URL', environment.DATABASE_URL],
    ['CORS_ORIGIN', environment.CORS_ORIGIN],
    ['REGISTRATION_MODE', environment.REGISTRATION_MODE],
  ];
  const missingSetting = requiredSettings.find(([, value]) => !value);
  if (missingSetting) {
    throw new Error(`${missingSetting[0]} is required in production`);
  }
}

function assertSupportedRegistrationConfiguration(environment: NodeJS.ProcessEnv) {
  if (environment.REGISTRATION_ACCESS_CODE?.trim()) {
    throw new Error(
      'REGISTRATION_ACCESS_CODE is no longer supported; use REGISTRATION_MODE=open or closed',
    );
  }
}

function registrationRateLimit(nodeEnvironment: NodeEnvironment, environment: NodeJS.ProcessEnv) {
  if (nodeEnvironment !== 'test') {
    return 5;
  }
  return integerValue(
    'TEST_AUTH_REGISTRATION_RATE_LIMIT',
    environment.TEST_AUTH_REGISTRATION_RATE_LIMIT ?? '5',
    1,
    10_000,
  );
}

function testEmailOutboxEnabled(nodeEnvironment: NodeEnvironment, environment: NodeJS.ProcessEnv) {
  const enabled = booleanValue('TEST_EMAIL_OUTBOX', environment.TEST_EMAIL_OUTBOX ?? 'false');
  if (enabled && nodeEnvironment !== 'test') {
    throw new Error('TEST_EMAIL_OUTBOX is only available in the test environment');
  }
  return enabled;
}

function devEmailVerificationSkipEnabled(
  nodeEnvironment: NodeEnvironment,
  environment: NodeJS.ProcessEnv,
) {
  const enabled = booleanValue(
    'DEV_SKIP_EMAIL_VERIFICATION',
    environment.DEV_SKIP_EMAIL_VERIFICATION ??
      (nodeEnvironment === 'development' ? 'true' : 'false'),
  );
  if (enabled && nodeEnvironment !== 'development') {
    throw new Error('DEV_SKIP_EMAIL_VERIFICATION is only available in the development environment');
  }
  return enabled;
}

function loadEmailConfiguration(environment: NodeJS.ProcessEnv) {
  if (environment.EMAIL_SMTP_URL?.trim()) {
    throw new Error('EMAIL_SMTP_URL is no longer supported; configure BREVO_API_KEY instead');
  }
  const brevoApiKey = optionalBrevoApiKey(environment.BREVO_API_KEY);
  const emailFrom = optionalEmailAddress('EMAIL_FROM', environment.EMAIL_FROM);
  const emailReplyTo = optionalEmailAddress('EMAIL_REPLY_TO', environment.EMAIL_REPLY_TO);
  assertEmailConfiguration(brevoApiKey, emailFrom, emailReplyTo);
  return { brevoApiKey, emailFrom, emailReplyTo };
}

function assertEmailConfiguration(
  brevoApiKey: string | undefined,
  emailFrom: EmailAddress | undefined,
  emailReplyTo: EmailAddress | undefined,
) {
  if (Boolean(brevoApiKey) !== Boolean(emailFrom)) {
    throw new Error('BREVO_API_KEY and EMAIL_FROM must be configured together');
  }
  if (emailReplyTo && !brevoApiKey) {
    throw new Error('EMAIL_REPLY_TO requires BREVO_API_KEY and EMAIL_FROM');
  }
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
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function optionalBrevoApiKey(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  if (/^xsmtpsib-/i.test(normalized)) {
    throw new Error('BREVO_API_KEY must contain a Brevo API key, not an SMTP key');
  }
  if (/\s/.test(normalized)) {
    throw new Error('BREVO_API_KEY must not contain whitespace');
  }
  return normalized;
}

function optionalEmailAddress(name: string, value: string | undefined): EmailAddress | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  if (/[\r\n]/.test(normalized)) {
    throw new Error(`${name} must not contain a line break`);
  }
  const { email, displayName } = parseEmailAddress(normalized);
  assertValidEmailAddress(name, email);
  assertDisplayNameLength(name, displayName);
  return { email, ...(displayName ? { name: displayName } : {}) };
}

function parseEmailAddress(value: string) {
  const mailbox = /^(.*?)\s*<([^<>]+)>$/.exec(value);
  const email = (mailbox?.[2] ?? value).trim();
  const displayName = mailbox?.[1].trim();
  return { email, displayName };
}

function assertValidEmailAddress(name: string, email: string) {
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(email)) {
    throw new Error(`${name} must contain a valid email address`);
  }
}

function assertDisplayNameLength(name: string, displayName: string | undefined) {
  if (displayName && displayName.length > 70) {
    throw new Error(`${name} display name must contain at most 70 characters`);
  }
}

function isAllowedValue<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((candidate) => candidate === value);
}

function enumValue<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (isAllowedValue(value, allowed)) {
    return value;
  }
  throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
}
