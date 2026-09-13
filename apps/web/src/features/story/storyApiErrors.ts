export function hasApiStatus(caught: unknown, ...statuses: number[]): boolean {
  return (
    caught instanceof Error &&
    'status' in caught &&
    typeof caught.status === 'number' &&
    statuses.includes(caught.status)
  );
}

export function isStoryRouteInaccessibleError(caught: unknown): boolean {
  return hasApiStatus(caught, 403, 404);
}
