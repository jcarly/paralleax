import { Injectable } from '@nestjs/common';

export type NodeEnvironment = 'development' | 'test' | 'production';

@Injectable()
export class AppConfigService {
  readonly databaseUrl!: string;
  readonly postgresSsl!: boolean;
  readonly port!: number;
  readonly corsOrigin!: string;
  readonly nodeEnvironment!: NodeEnvironment;
  readonly legacyStoryOwnerEmail?: string;

  constructor() {
    Object.assign(this, loadAppConfig(process.env));
  }

  get secureCookies() {
    return this.nodeEnvironment === 'production';
  }
}

export function loadAppConfig(environment: NodeJS.ProcessEnv) {
  return {
    nodeEnvironment: enumValue('NODE_ENV', environment.NODE_ENV ?? 'development', [
      'development',
      'test',
      'production',
    ] as const),
    databaseUrl: validUrl(
      'DATABASE_URL',
      environment.DATABASE_URL ?? 'postgres://paralleax:paralleax@localhost:5432/paralleax',
      ['postgres:', 'postgresql:'],
    ),
    corsOrigin: validUrl('CORS_ORIGIN', environment.CORS_ORIGIN ?? 'http://localhost:5173', [
      'http:',
      'https:',
    ]),
    port: validPort(environment.PORT ?? '3000'),
    postgresSsl: booleanValue('POSTGRES_SSL', environment.POSTGRES_SSL ?? 'false'),
    legacyStoryOwnerEmail: optionalEmail(environment.LEGACY_STORY_OWNER_EMAIL),
  };
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

function optionalEmail(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new Error('LEGACY_STORY_OWNER_EMAIL must be a valid email address');
  }
  return normalized;
}
