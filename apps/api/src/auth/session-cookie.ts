export const sessionCookieName = 'paralleax_session';

export function readSessionCookie(cookieHeader: string | undefined) {
  return cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === sessionCookieName)?.[1];
}
