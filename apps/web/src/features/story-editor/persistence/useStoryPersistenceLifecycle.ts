import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mergeServerStory,
  type InteractionContentPatch,
  type Story,
  type StoryEditorLoadingProjection,
} from '@paralleax/shared';
import { useStoryRealtime } from '../../../hooks/useStoryRealtime';
import {
  isApiNotFound,
  prioritizeStoryRealtimeInvalidation,
  type StoryRealtimeInvalidation,
} from '../../realtime/storyRealtime';
import type { MergeIncomingStory, StoryStateSetter, TrackStorySave } from './storyPersistenceTypes';
import { loadStoryEditorProjection } from './storyEditorLoader';

interface StoryPersistenceLifecycleDependencies {
  storyId: string;
  story: Story | undefined;
  setStory: StoryStateSetter;
}

type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface StoryPersistenceFeedback {
  storyId: string;
  error: string;
  saveStatus: StorySaveStatus;
}

export function useStoryPersistenceLifecycle({
  storyId,
  story,
  setStory,
}: StoryPersistenceLifecycleDependencies) {
  const [feedback, setFeedback] = useState<StoryPersistenceFeedback>({
    storyId,
    error: '',
    saveStatus: 'idle',
  });
  const error = feedback.storyId === storyId ? feedback.error : '';
  const saveStatus = feedback.storyId === storyId ? feedback.saveStatus : 'idle';
  const [loadProgress, setLoadProgress] = useState<{
    storyId: string;
    phase: StoryEditorLoadingProjection['phase'] | 'bootstrap';
  }>({ storyId, phase: 'bootstrap' });
  const loadPhase = loadProgress.storyId === storyId ? loadProgress.phase : 'bootstrap';
  const saveBatchErrorRef = useRef('');
  const deletedTriggerIdsRef = useRef(new Set<string>());
  const deletedTriggerInputKeysRef = useRef(new Set<string>());
  const loadAttemptRef = useRef(0);
  const activeSaveCountRef = useRef(0);
  const localEditDepthRef = useRef(0);
  const lifecycleVersionRef = useRef(0);
  const pendingRealtimeInvalidationRef = useRef<StoryRealtimeInvalidation | undefined>(undefined);
  const realtimeRefreshRef = useRef<(invalidation: StoryRealtimeInvalidation) => void>(() => {});

  const updateFeedback = useCallback(
    (patch: Partial<Omit<StoryPersistenceFeedback, 'storyId'>>) => {
      setFeedback((current) => ({
        ...(current.storyId === storyId
          ? current
          : { storyId, error: '', saveStatus: 'idle' as const }),
        ...patch,
        storyId,
      }));
    },
    [storyId],
  );

  useEffect(() => {
    lifecycleVersionRef.current += 1;
    activeSaveCountRef.current = 0;
    saveBatchErrorRef.current = '';
    localEditDepthRef.current = 0;
    pendingRealtimeInvalidationRef.current = undefined;
    return () => {
      lifecycleVersionRef.current += 1;
    };
  }, [storyId]);

  const replaceStory = useCallback(
    (next: Story) => {
      setStory((current) => {
        if (
          current?.id === next.id &&
          current.revision !== undefined &&
          next.revision !== undefined &&
          next.revision < current.revision
        ) {
          return current;
        }
        deletedTriggerIdsRef.current.clear();
        deletedTriggerInputKeysRef.current.clear();
        return next;
      });
    },
    [setStory],
  );

  const flushPendingRealtimeRefresh = useCallback(() => {
    if (activeSaveCountRef.current > 0 || localEditDepthRef.current > 0) return;
    const pending = pendingRealtimeInvalidationRef.current;
    if (!pending) return;
    pendingRealtimeInvalidationRef.current = undefined;
    realtimeRefreshRef.current(pending);
  }, []);

  const trackSave: TrackStorySave = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      const lifecycleVersion = lifecycleVersionRef.current;
      const startsBatch = activeSaveCountRef.current === 0;
      if (startsBatch) {
        saveBatchErrorRef.current = '';
        updateFeedback({ error: '' });
      }
      activeSaveCountRef.current += 1;
      updateFeedback({ saveStatus: 'saving' });
      try {
        const result = await operation();
        return lifecycleVersion === lifecycleVersionRef.current ? result : undefined;
      } catch (caught) {
        if (lifecycleVersion !== lifecycleVersionRef.current) return undefined;
        const message = caught instanceof Error ? caught.message : 'The story could not be saved.';
        saveBatchErrorRef.current = message;
        updateFeedback({ error: message, saveStatus: 'error' });
        return undefined;
      } finally {
        if (lifecycleVersion === lifecycleVersionRef.current) {
          activeSaveCountRef.current = Math.max(0, activeSaveCountRef.current - 1);
          if (activeSaveCountRef.current === 0) {
            updateFeedback({ saveStatus: saveBatchErrorRef.current ? 'error' : 'saved' });
          } else if (!saveBatchErrorRef.current) {
            updateFeedback({ saveStatus: 'saving' });
          }
          flushPendingRealtimeRefresh();
        }
      }
    },
    [flushPendingRealtimeRefresh, updateFeedback],
  );

  const mergeIncomingStory: MergeIncomingStory = useCallback(
    (
      current: Story,
      incoming: Story,
      edited?: { interactionId: string; patch: InteractionContentPatch },
      options: { preserveCurrentTriggers?: boolean } = {},
    ): Story =>
      mergeServerStory(current, incoming, edited, {
        ...options,
        deletedTriggerIds: deletedTriggerIdsRef.current,
        deletedTriggerInputKeys: deletedTriggerInputKeysRef.current,
      }),
    [],
  );

  const load = useCallback(() => {
    const attempt = ++loadAttemptRef.current;
    return loadStoryEditorProjection(storyId, (projection) => {
      if (attempt !== loadAttemptRef.current) return;
      setStory(projection.story);
      setLoadProgress({ storyId, phase: projection.phase });
    })
      .then((next) => {
        if (attempt !== loadAttemptRef.current) return;
        replaceStory(next);
        setLoadProgress({ storyId, phase: 'ready' });
        updateFeedback({ error: '', saveStatus: 'idle' });
      })
      .catch((caught: Error) => {
        if (attempt !== loadAttemptRef.current) return;
        updateFeedback({ error: caught.message, saveStatus: 'error' });
      });
  }, [replaceStory, setStory, storyId, updateFeedback]);

  const retry = useCallback(() => {
    setLoadProgress({ storyId, phase: 'bootstrap' });
    return load();
  }, [load, storyId]);

  const refreshFromRealtime = useCallback(
    (invalidation: StoryRealtimeInvalidation) => {
      if (activeSaveCountRef.current > 0 || localEditDepthRef.current > 0) {
        pendingRealtimeInvalidationRef.current = prioritizeStoryRealtimeInvalidation(
          pendingRealtimeInvalidationRef.current,
          invalidation,
        );
        return;
      }

      const attempt = ++loadAttemptRef.current;
      void loadStoryEditorProjection(storyId)
        .then((next) => {
          if (attempt !== loadAttemptRef.current) return;
          if (activeSaveCountRef.current > 0 || localEditDepthRef.current > 0) {
            pendingRealtimeInvalidationRef.current = prioritizeStoryRealtimeInvalidation(
              pendingRealtimeInvalidationRef.current,
              invalidation,
            );
            return;
          }
          replaceStory(next);
          setLoadProgress({ storyId, phase: 'ready' });
          updateFeedback({ error: '' });
        })
        .catch((caught: unknown) => {
          if (attempt !== loadAttemptRef.current) return;
          if (invalidation === 'deleted' || isApiNotFound(caught)) {
            setStory(undefined);
            updateFeedback({
              error: caught instanceof Error ? caught.message : 'Story not found',
              saveStatus: 'error',
            });
          }
        });
    },
    [replaceStory, setStory, storyId, updateFeedback],
  );

  useEffect(() => {
    realtimeRefreshRef.current = refreshFromRealtime;
  }, [refreshFromRealtime]);

  const realtimeStatus = useStoryRealtime(
    storyId,
    loadPhase === 'ready' && story?.capabilities?.canEdit === true,
    refreshFromRealtime,
    story?.revision,
  );

  const beginLocalEdit = useCallback(() => {
    localEditDepthRef.current += 1;
  }, []);

  const endLocalEdit = useCallback(() => {
    localEditDepthRef.current = Math.max(0, localEditDepthRef.current - 1);
    setTimeout(flushPendingRealtimeRefresh, 0);
  }, [flushPendingRealtimeRefresh]);

  useEffect(() => {
    const pendingLoad = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(pendingLoad);
      loadAttemptRef.current += 1;
    };
  }, [load]);

  return {
    error,
    loadPhase,
    saveStatus,
    realtimeStatus,
    beginLocalEdit,
    endLocalEdit,
    retry,
    trackSave,
    mergeIncomingStory,
    replaceStory,
    deletedTriggerIdsRef,
    deletedTriggerInputKeysRef,
  };
}
