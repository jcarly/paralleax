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
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function booleanValue(name: string, value: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function enumValue<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
}
