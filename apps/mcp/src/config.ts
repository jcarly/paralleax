import { homedir } from 'node:os';
import { join } from 'node:path';

/** Default API base URL: the local development API started by `npm run dev`. */
export const DEFAULT_API_URL = 'http://localhost:3000/api';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}

/**
 * Validates the Paralleax API base URL. The session token travels with every
 * request, so plain HTTP is only accepted for loopback development servers.
 */
export function parseApiUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError('PARALLEAX_API_URL must be an absolute URL');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new ConfigurationError(
      'PARALLEAX_API_URL must not contain credentials, a query or a fragment',
    );
  }
  const secure = url.protocol === 'https:';
  const loopback = url.protocol === 'http:' && loopbackHosts.has(url.hostname);
  if (!secure && !loopback) {
    throw new ConfigurationError('PARALLEAX_API_URL must use https unless it targets localhost');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

export function sessionFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PARALLEAX_MCP_SESSION_FILE;
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }
  const configHome =
    env.XDG_CONFIG_HOME !== undefined && env.XDG_CONFIG_HOME !== ''
      ? env.XDG_CONFIG_HOME
      : join(homedir(), '.config');
  return join(configHome, 'paralleax-mcp', 'session.json');
}

export function apiUrlFromEnvironment(env: NodeJS.ProcessEnv = process.env): URL {
  const raw = env.PARALLEAX_API_URL;
  return parseApiUrl(raw === undefined || raw === '' ? DEFAULT_API_URL : raw);
}

/** Joins the API base URL and an endpoint path such as `/stories`. */
export function apiEndpoint(apiUrl: URL, path: string): string {
  return `${apiUrl.origin}${apiUrl.pathname.replace(/\/+$/, '')}${path}`;
}
