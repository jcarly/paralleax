import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ConfigurationError, parseApiUrl } from './config.js';

/** A Paralleax session created by `paralleax-mcp login`, bound to one API origin. */
export interface StoredSession {
  apiUrl: string;
  token: string;
  createdAt: string;
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'apiUrl' in value &&
    typeof value.apiUrl === 'string' &&
    'token' in value &&
    typeof value.token === 'string' &&
    value.token !== '' &&
    'createdAt' in value &&
    typeof value.createdAt === 'string'
  );
}

export async function readStoredSession(path: string): Promise<StoredSession | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isStoredSession(parsed)) {
    throw new ConfigurationError(`The session file ${path} is invalid; run "login" again`);
  }
  return parsed;
}

/** Writes the session readable by the current OS user only (mode 0600). */
export async function writeStoredSession(path: string, session: StoredSession): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function deleteStoredSession(path: string): Promise<void> {
  await rm(path, { force: true });
}

/**
 * Resolves the session token for an API URL. PARALLEAX_SESSION_TOKEN wins;
 * otherwise the stored session is used only when it was created for the same
 * API origin, so a token is never sent to a different server.
 */
export async function resolveSessionToken(
  apiUrl: URL,
  env: NodeJS.ProcessEnv,
  path: string,
): Promise<string | undefined> {
  const explicit = env.PARALLEAX_SESSION_TOKEN;
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  const stored = await readStoredSession(path);
  if (!stored) {
    return undefined;
  }
  if (parseApiUrl(stored.apiUrl).href !== apiUrl.href) {
    throw new ConfigurationError(
      `The stored session belongs to ${stored.apiUrl}; run "login" for ${apiUrl.href}`,
    );
  }
  return stored.token;
}
