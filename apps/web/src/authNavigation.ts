const localOrigin = 'https://paralleax.local';

export function safeReturnTo(value: string | null, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const destination = new URL(value, localOrigin);
    if (destination.origin !== localOrigin) return fallback;
    if (destination.pathname === '/login' || destination.pathname === '/register') return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export function authenticationPath(mode: 'login' | 'register', returnTo: string) {
  const query = new URLSearchParams({ returnTo: safeReturnTo(returnTo) });
  return `/${mode}?${query}`;
}
