import {
  apiErrorFromResponse,
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
  const response = await fetchImpl(apiEndpoint(apiUrl, '/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(credentials),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
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

/** Revokes the stored session on the API (best effort) and deletes the file. */
export async function logout(
  sessionFile: string,
  fetchImpl: FetchLike = defaultFetch,
): Promise<void> {
  const stored = await readStoredSession(sessionFile);
  if (stored) {
    await fetchImpl(apiEndpoint(new URL(stored.apiUrl), '/auth/logout'), {
      method: 'POST',
      headers: sessionCookieHeader(stored.token),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
  }
  await deleteStoredSession(sessionFile);
}

export function whoAmI(api: ParalleaxApiClient): Promise<PublicUser> {
  return api.get('/auth/me', publicUserSchema);
}
