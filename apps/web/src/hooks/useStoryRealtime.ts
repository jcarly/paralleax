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
    if (!enabled || typeof EventSource === 'undefined') {
      return;
    }
    const source = new EventSource(`/api/stories/${encodeURIComponent(storyId)}/events`);
    const disconnect = connectStoryInvalidations(source, callback, revision);
    source.onopen = () => {
      setLiveStoryId(storyId);
    };
    source.onerror = () => {
      setLiveStoryId((connectedStoryId) =>
        connectedStoryId === storyId ? undefined : connectedStoryId,
      );
    };

    return () => {
      disconnect();
      source.close();
    };
  }, [enabled, storyId]);

  if (typeof EventSource === 'undefined') {
    return 'unavailable';
  }
  return liveStoryId === storyId ? 'live' : 'reconnecting';
}

function connectStoryInvalidations(
  source: EventSource,
  callback: { current: (invalidation: StoryRealtimeInvalidation) => void },
  revision: { current: number | undefined },
) {
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let receivedReady = false;
  const schedule = createRefreshScheduler(
    callback,
    revision,
    () => refreshTimer,
    (timer) => {
      refreshTimer = timer;
    },
  );
  const ready = () => {
    if (!receivedReady) {
      receivedReady = true;
      return;
    }
    schedule('ready');
  };
  const changed = (event: Event) => {
    schedule('changed', storyEventRevision(event));
  };
  const deleted = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    callback.current('deleted');
  };

  source.addEventListener('ready', ready);
  source.addEventListener('story-changed', changed);
  source.addEventListener('story-deleted', deleted);
  return () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
  };
}

function createRefreshScheduler(
  callback: { current: (invalidation: StoryRealtimeInvalidation) => void },
  revision: { current: number | undefined },
  getTimer: () => ReturnType<typeof setTimeout> | undefined,
  setTimer: (timer: ReturnType<typeof setTimeout>) => void,
) {
  return (invalidation: StoryRealtimeInvalidation, eventRevision?: number) => {
    const previousTimer = getTimer();
    if (previousTimer) {
      clearTimeout(previousTimer);
    }
    setTimer(
      setTimeout(() => {
        if (
          invalidation === 'changed' &&
          eventRevision !== undefined &&
          revision.current !== undefined &&
          revision.current >= eventRevision
        ) {
          return;
        }
        callback.current(invalidation);
      }, refreshDelayMs),
    );
  };
}

function storyEventRevision(event: Event): number | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
    return undefined;
  }
  try {
    const data: unknown = JSON.parse(event.data);
    if (typeof data !== 'object' || data === null || !('revision' in data)) {
      return undefined;
    }
    return typeof data.revision === 'number' ? data.revision : undefined;
  } catch {
    return undefined;
  }
}
