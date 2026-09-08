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

export function useStoryPersistenceLifecycle({
  storyId,
  story,
  setStory,
}: StoryPersistenceLifecycleDependencies) {
  const [error, setError] = useState('');
  const [loadProgress, setLoadProgress] = useState<{
    storyId: string;
    phase: StoryEditorLoadingProjection['phase'] | 'bootstrap';
  }>({ storyId, phase: 'bootstrap' });
  const loadPhase = loadProgress.storyId === storyId ? loadProgress.phase : 'bootstrap';
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveBatchErrorRef = useRef('');
  const deletedTriggerIdsRef = useRef(new Set<string>());
  const deletedTriggerInputKeysRef = useRef(new Set<string>());
  const loadAttemptRef = useRef(0);
  const activeSaveCountRef = useRef(0);
  const localEditDepthRef = useRef(0);
  const pendingRealtimeInvalidationRef = useRef<StoryRealtimeInvalidation | undefined>(undefined);
  const realtimeRefreshRef = useRef<(invalidation: StoryRealtimeInvalidation) => void>(() => {});

  const replaceStory = useCallback(
    (next: Story) => {
      deletedTriggerIdsRef.current.clear();
      deletedTriggerInputKeysRef.current.clear();
      setStory(next);
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
      const startsBatch = activeSaveCountRef.current === 0;
      if (startsBatch) {
        saveBatchErrorRef.current = '';
        setError('');
      }
      activeSaveCountRef.current += 1;
      setSaveStatus('saving');
      try {
        return await operation();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'The story could not be saved.';
        saveBatchErrorRef.current = message;
        setError(message);
        setSaveStatus('error');
        return undefined;
      } finally {
        activeSaveCountRef.current = Math.max(0, activeSaveCountRef.current - 1);
        if (activeSaveCountRef.current === 0) {
          setSaveStatus(saveBatchErrorRef.current ? 'error' : 'saved');
        } else if (!saveBatchErrorRef.current) {
          setSaveStatus('saving');
        }
        flushPendingRealtimeRefresh();
      }
    },
    [flushPendingRealtimeRefresh],
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
        setError('');
        setSaveStatus('idle');
      })
      .catch((caught: Error) => {
        if (attempt !== loadAttemptRef.current) return;
        setError(caught.message);
        setSaveStatus('error');
      });
  }, [replaceStory, setStory, storyId]);

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
          setError('');
        })
        .catch((caught: unknown) => {
          if (attempt !== loadAttemptRef.current) return;
          if (invalidation === 'deleted' || isApiNotFound(caught)) {
            setStory(undefined);
            setError(caught instanceof Error ? caught.message : 'Story not found');
            setSaveStatus('error');
          }
        });
    },
    [replaceStory, setStory, storyId],
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
    void load();
    return () => {
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
