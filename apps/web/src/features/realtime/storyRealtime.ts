export type StoryRealtimeStatus = 'live' | 'reconnecting' | 'unavailable';
export type StoryRealtimeInvalidation = 'ready' | 'changed' | 'deleted';

export function prioritizeStoryRealtimeInvalidation(
  current: StoryRealtimeInvalidation | undefined,
  incoming: StoryRealtimeInvalidation,
): StoryRealtimeInvalidation {
  if (current === 'deleted' || incoming === 'deleted') return 'deleted';
  if (current === 'changed' || incoming === 'changed') return 'changed';
  return 'ready';
}

export function isApiNotFound(caught: unknown): boolean {
  return (
    caught instanceof Error &&
    'status' in caught &&
    typeof caught.status === 'number' &&
    caught.status === 404
  );
}

export function isRealtimeEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select, [contenteditable="true"]') ||
      target.closest('[contenteditable="true"]') !== null)
  );
}
