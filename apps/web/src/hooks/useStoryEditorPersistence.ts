import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyStoryGraphPositionPatch,
  type Story,
  type StoryGraphPositionPatch,
} from '@paralleax/shared';
import { api } from '../api';
import { useStoryContextPersistence } from '../features/story-editor/persistence/storyContextPersistence';
import { useStoryGraphPersistence } from '../features/story-editor/persistence/storyGraphPersistence';
import { useStoryPersistenceLifecycle } from '../features/story-editor/persistence/useStoryPersistenceLifecycle';
import type {
  OptimisticGraphHistoryChange,
  TrackStorySave,
  TrackStorySaveOptions,
} from '../features/story-editor/persistence/storyPersistenceTypes';
import { useStoryHistory } from '../features/story-editor/history/useStoryHistory';
import {
  applyStoryMutationMetadata,
  getStoryMutationRevision,
} from '../features/story/storyMutationResults';

export function useStoryEditorPersistence(storyId: string) {
  const [story, setStory] = useState<Story>();
  const persistence = useStoryPersistenceLifecycle({ storyId, story, setStory });
  const trackPersistenceSave = persistence.trackSave;
  const markLocalHistoryChangeRef = useRef<
    (revision?: number, graphHistoryChange?: OptimisticGraphHistoryChange) => void
  >(() => {});
  const trackAuthoredSave: TrackStorySave = useCallback(
    async <T>(operation: () => Promise<T>, options?: TrackStorySaveOptions) => {
      const result = await trackPersistenceSave(operation);
      if (result !== undefined) {
        markLocalHistoryChangeRef.current(
          getStoryMutationRevision(result),
          options?.graphHistoryChange,
        );
      }
      return result;
    },
    [trackPersistenceSave],
  );

  async function renameStory(title: string) {
    const next = await trackAuthoredSave(() => api.renameStory(storyId, title));
    if (!next) return;
    setStory((current) => (current ? persistence.mergeIncomingStory(current, next) : next));
  }

  async function updateStoryStartDateTime(startDateTime: string) {
    const next = await trackAuthoredSave(() => api.updateStory(storyId, { startDateTime }));
    if (!next) return;
    setStory((current) => (current ? persistence.mergeIncomingStory(current, next) : next));
  }

  const graphPersistence = useStoryGraphPersistence({
    storyId,
    story,
    setStory,
    trackSave: trackAuthoredSave,
    mergeIncomingStory: persistence.mergeIncomingStory,
    deletedTriggerIdsRef: persistence.deletedTriggerIdsRef,
    deletedTriggerInputKeysRef: persistence.deletedTriggerInputKeysRef,
  });

  const contextPersistence = useStoryContextPersistence({
    storyId,
    story,
    setStory,
    trackSave: trackAuthoredSave,
  });

  const applyHistoryGraphPositions = useCallback(
    (patch: StoryGraphPositionPatch, mutation?: { revision: number; updatedAt: string }) => {
      setStory((current) =>
        current?.id === storyId
          ? mutation
            ? applyStoryMutationMetadata(applyStoryGraphPositionPatch(current, patch), mutation)
            : applyStoryGraphPositionPatch(current, patch)
          : current,
      );
    },
    [storyId],
  );

  const history = useStoryHistory({
    storyId,
    story,
    replaceStory: persistence.replaceStory,
    applyGraphPositions: applyHistoryGraphPositions,
    trackSave: persistence.trackSave,
  });

  useEffect(() => {
    markLocalHistoryChangeRef.current = history.markLocalChange;
  }, [history.markLocalChange]);

  return {
    story,
    setStory,
    error: persistence.error,
    saveStatus: persistence.saveStatus,
    realtimeStatus: persistence.realtimeStatus,
    beginLocalEdit: persistence.beginLocalEdit,
    endLocalEdit: persistence.endLocalEdit,
    retry: persistence.retry,
    history: history.history,
    historyBusy: history.historyBusy,
    undo: history.undo,
    redo: history.redo,
    renameStory,
    updateStoryStartDateTime,
    ...graphPersistence,
    ...contextPersistence,
  };
}
