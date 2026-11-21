import {
  apiErrorFromResponse,
  apiUnreachableError,
  defaultFetch,
  parseApiResponse,
  ParalleaxApiError,
  type FetchLike,
  type ParalleaxApiClient,
} from './api-client.js';
import { publicUserSchema } from './api-contract.js';
import { apiEndpoint } from './config.js';
import { sessionCookieHeader, sessionTokenFromSetCookie } from './session-cookie.js';
import { deleteStoredSession, readStoredSession, writeStoredSession } from './session-store.js';

export interface Credentials {
  email: string;
  password: string;
}

interface PublicUser {
  id: string;
  displayName: string;
}

/**
 * Signs in with the regular Paralleax login endpoint and stores the resulting
 * session (a separate, revocable server-side session) for the MCP server.
 */
export async function login(
  apiUrl: URL,
  credentials: Credentials,
  sessionFile: string,
  fetchImpl: FetchLike = defaultFetch,
): Promise<PublicUser> {
  let response: Response;
  try {
    response = await fetchImpl(apiEndpoint(apiUrl, '/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(credentials),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A session created by a login that timed out is never stored, so retrying is safe.
    throw apiUnreachableError(apiUrl);
  }
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  const token = sessionTokenFromSetCookie(response.headers.getSetCookie());
  if (token === undefined) {
    throw new ParalleaxApiError({
      status: 502,
      code: 'SESSION_MISSING',
      message: 'The API did not return a session',
    });
  }
  await writeStoredSession(sessionFile, {
    apiUrl: apiUrl.href,
    token,
    createdAt: new Date().toISOString(),
  });
  const user: unknown = await response.json();
  return parseApiResponse(publicUserSchema, user);
}

export interface LogoutOptions {
  /** Delete the local file even if the API cannot revoke the session. */
  localOnly?: boolean;
  fetch?: FetchLike;
}

async function revoke(stored: { apiUrl: string; token: string }, fetchImpl: FetchLike) {
  let response: Response;
  try {
    response = await fetchImpl(apiEndpoint(new URL(stored.apiUrl), '/auth/logout'), {
      method: 'POST',
      headers: sessionCookieHeader(stored.token),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    response = new Response(null, { status: 503 });
  }
  if (!response.ok) {
    throw new ParalleaxApiError({
      status: response.status,
      code: 'SESSION_REVOCATION_FAILED',
      message:
        'The API did not revoke the session, so the session file was kept. Retry, or use "logout --local-only" and sign out other sessions from the Paralleax account menu',
    });
  }
}

/**
 * Revokes the stored session on the API, then deletes the file. The file is
 * kept when revocation fails, so a still-valid session is never forgotten.
 * Returns whether the API revoked the session.
 */
export async function logout(sessionFile: string, options: LogoutOptions = {}): Promise<boolean> {
  // Logging out must work even when the file permissions are wrong.
  const stored = await readStoredSession(sessionFile, { checkPermissions: false });
  if (stored && options.localOnly !== true) {
    await revoke(stored, options.fetch ?? defaultFetch);
  }
  await deleteStoredSession(sessionFile);
  return stored !== undefined && options.localOnly !== true;
}

export function whoAmI(api: ParalleaxApiClient): Promise<PublicUser> {
  return api.get('/auth/me', publicUserSchema);
}
