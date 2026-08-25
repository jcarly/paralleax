import { useEffect, useRef, useState } from 'react';
import type {
  StoryRealtimeInvalidation,
  StoryRealtimeStatus,
} from '../features/realtime/storyRealtime';

export type {
  StoryRealtimeInvalidation,
  StoryRealtimeStatus,
} from '../features/realtime/storyRealtime';

const refreshDelayMs = 75;

export function useStoryRealtime(
  storyId: string,
  enabled: boolean,
  onInvalidate: (invalidation: StoryRealtimeInvalidation) => void,
): StoryRealtimeStatus {
  const callback = useRef(onInvalidate);
  const [liveStoryId, setLiveStoryId] = useState<string>();

  useEffect(() => {
    callback.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/stories/${encodeURIComponent(storyId)}/events`);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (invalidation: StoryRealtimeInvalidation) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => callback.current(invalidation), refreshDelayMs);
    };
    const deleted = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      callback.current('deleted');
    };

    source.addEventListener('ready', () => schedule('ready'));
    source.addEventListener('story-changed', () => schedule('changed'));
    source.addEventListener('story-deleted', deleted);
    source.onopen = () => setLiveStoryId(storyId);
    source.onerror = () =>
      setLiveStoryId((connectedStoryId) =>
        connectedStoryId === storyId ? undefined : connectedStoryId,
      );

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      source.close();
    };
  }, [enabled, storyId]);

  if (typeof EventSource === 'undefined') return 'unavailable';
  return liveStoryId === storyId ? 'live' : 'reconnecting';
}
