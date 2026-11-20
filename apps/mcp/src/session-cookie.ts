/** The API's session cookie (apps/api/src/auth/session-cookie.ts). */
export const SESSION_COOKIE_NAME = 'paralleax_session';

export function sessionCookieHeader(token: string): { Cookie: string } {
  return { Cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

/** Extracts the session token from the Set-Cookie headers of a login response. */
export function sessionTokenFromSetCookie(setCookieHeaders: readonly string[]): string | undefined {
  const prefix = `${SESSION_COOKIE_NAME}=`;
  for (const header of setCookieHeaders) {
    const pair = header.split(';', 1).join('').trim();
    if (pair.startsWith(prefix) && pair.length > prefix.length) {
      return pair.slice(prefix.length);
    }
  }
  return undefined;
}
