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
  currentRevision?: number,
): StoryRealtimeStatus {
  const callback = useRef(onInvalidate);
  const revision = useRef(currentRevision);
  const [liveStoryId, setLiveStoryId] = useState<string>();

  useEffect(() => {
    callback.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    revision.current = currentRevision;
  }, [currentRevision]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/stories/${encodeURIComponent(storyId)}/events`);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let receivedReady = false;

    const schedule = (invalidation: StoryRealtimeInvalidation, eventRevision?: number) => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (
          invalidation === 'changed' &&
          eventRevision !== undefined &&
          revision.current !== undefined &&
          revision.current >= eventRevision
        ) {
          return;
        }
        callback.current(invalidation);
      }, refreshDelayMs);
    };
    const deleted = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      callback.current('deleted');
    };

    source.addEventListener('ready', () => {
      if (!receivedReady) {
        receivedReady = true;
        return;
      }
      schedule('ready');
    });
    source.addEventListener('story-changed', (event) =>
      schedule('changed', storyEventRevision(event)),
    );
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

function storyEventRevision(event: Event): number | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return undefined;
  try {
    const data: unknown = JSON.parse(event.data);
    if (typeof data !== 'object' || data === null || !('revision' in data)) return undefined;
    return typeof data.revision === 'number' ? data.revision : undefined;
  } catch {
    return undefined;
  }
}
