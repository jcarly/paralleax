import { useCallback, useEffect, useRef } from 'react';
import type { ReaderProgressState, Story } from '@paralleax/shared';
import { api } from '../../../api';
import {
  prioritizeStoryRealtimeInvalidation,
  type StoryRealtimeInvalidation,
} from '../../realtime/storyRealtime';
import type { SimulationMutationStatus } from '../useSimulationMutationPersistence';
import { loadStoryRuntimeContext } from '../storyRuntimeLoader';
import { loadLatestRuntimeSliceForSession } from './loadLatestRuntimeSliceForSession';

type RefreshCallback = (invalidation: StoryRealtimeInvalidation) => void;

export function useStoryPlayerRealtimeRefresh({
  storyId,
  getCurrentSession,
  getNavigationVersion,
  hasActiveMutations,
  mutationStatus,
  applyReloadedStory,
  onRefreshFailure,
}: {
  storyId: string;
  getCurrentSession: () => ReaderProgressState;
  getNavigationVersion: () => number;
  hasActiveMutations: () => boolean;
  mutationStatus: SimulationMutationStatus;
  applyReloadedStory: (story: Story) => void;
  onRefreshFailure: (caught: unknown, invalidation: StoryRealtimeInvalidation) => void;
}) {
  const realtimeLoadAttempt = useRef(0);
  const simulationEditDepth = useRef(0);
  const pendingRealtimeInvalidation = useRef<StoryRealtimeInvalidation | undefined>(undefined);
  const realtimeRefresh = useRef<RefreshCallback>(() => {});

  const flushPendingRealtimeRefresh = useCallback(() => {
    if (hasActiveMutations() || simulationEditDepth.current > 0) return;
    const pending = pendingRealtimeInvalidation.current;
    if (!pending) return;
    pendingRealtimeInvalidation.current = undefined;
    realtimeRefresh.current(pending);
  }, [hasActiveMutations]);

  const refreshFromRealtime = useCallback(
    (invalidation: StoryRealtimeInvalidation) => {
      if (hasActiveMutations() || simulationEditDepth.current > 0) {
        pendingRealtimeInvalidation.current = prioritizeStoryRealtimeInvalidation(
          pendingRealtimeInvalidation.current,
          invalidation,
        );
        return;
      }

      const attempt = ++realtimeLoadAttempt.current;
      const navigationVersion = getNavigationVersion();
      void api
        .getStoryRuntimeBootstrap(storyId)
        .then((bootstrap) => loadStoryRuntimeContext(storyId, bootstrap))
        .then((runtimeStory) => loadLatestRuntimeSliceForSession(runtimeStory, getCurrentSession))
        .then((nextStory) => {
          if (attempt !== realtimeLoadAttempt.current) return;
          if (navigationVersion !== getNavigationVersion()) {
            realtimeRefresh.current(invalidation);
            return;
          }
          if (hasActiveMutations() || simulationEditDepth.current > 0) {
            pendingRealtimeInvalidation.current = prioritizeStoryRealtimeInvalidation(
              pendingRealtimeInvalidation.current,
              invalidation,
            );
            return;
          }

          applyReloadedStory(nextStory);
        })
        .catch((caught: unknown) => {
          if (attempt !== realtimeLoadAttempt.current) return;
          onRefreshFailure(caught, invalidation);
        });
    },
    [
      applyReloadedStory,
      getCurrentSession,
      getNavigationVersion,
      hasActiveMutations,
      onRefreshFailure,
      storyId,
    ],
  );

  useEffect(() => {
    realtimeRefresh.current = refreshFromRealtime;
  }, [refreshFromRealtime]);

  const beginSimulationEdit = useCallback(() => {
    simulationEditDepth.current += 1;
  }, []);

  const endSimulationEdit = useCallback(() => {
    simulationEditDepth.current = Math.max(0, simulationEditDepth.current - 1);
    setTimeout(flushPendingRealtimeRefresh, 0);
  }, [flushPendingRealtimeRefresh]);

  useEffect(() => {
    if (mutationStatus !== 'saving') flushPendingRealtimeRefresh();
  }, [flushPendingRealtimeRefresh, mutationStatus]);

  return { refreshFromRealtime, beginSimulationEdit, endSimulationEdit };
}
