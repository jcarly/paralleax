import { useCallback, useEffect, useRef, useState } from 'react';
import type { Story, StoryGraphPositionPatch, StoryHistory } from '@paralleax/shared';
import { api } from '../../../api';
import type {
  OptimisticGraphHistoryChange,
  TrackStorySave,
} from '../persistence/storyPersistenceTypes';

interface StoryHistoryDependencies {
  storyId: string;
  story: Story | undefined;
  replaceStory: (story: Story) => void;
  applyGraphPositions: (
    patch: StoryGraphPositionPatch,
    mutation?: { revision: number; updatedAt: string },
  ) => void;
  trackSave: TrackStorySave;
}

const emptyHistory: StoryHistory = { entries: [], canUndo: false, canRedo: false };
const maximumOptimisticGraphHistory = 20;

interface OptimisticGraphHistoryEntry extends OptimisticGraphHistoryChange {
  revision: number;
}

export function useStoryHistory({
  storyId,
  story,
  replaceStory,
  applyGraphPositions,
  trackSave,
}: StoryHistoryDependencies) {
  const [history, setHistory] = useState<StoryHistory>(emptyHistory);
  const [busy, setBusy] = useState(false);
  const loadAttemptRef = useRef(0);
  const loadedRevisionRef = useRef<string | undefined>(undefined);
  const localRevisionsRef = useRef(new Set<number>());
  const localChangeVersionRef = useRef(0);
  const optimisticUndoRef = useRef<OptimisticGraphHistoryEntry[]>([]);
  const optimisticRedoRef = useRef<OptimisticGraphHistoryEntry[]>([]);

  const clearOptimisticGraphHistory = useCallback(() => {
    optimisticUndoRef.current = [];
    optimisticRedoRef.current = [];
  }, []);

  useEffect(() => {
    if (story?.capabilities?.canEdit !== true || story.id !== storyId) {
      loadedRevisionRef.current = undefined;
      localRevisionsRef.current.clear();
      clearOptimisticGraphHistory();
      return;
    }
    const revisionKey = `${story.id}:${story.revision ?? 'legacy'}`;
    if (loadedRevisionRef.current === revisionKey) return;
    if (story.revision !== undefined && localRevisionsRef.current.delete(story.revision)) {
      loadedRevisionRef.current = revisionKey;
      return;
    }
    clearOptimisticGraphHistory();
    const attempt = ++loadAttemptRef.current;
    const localChangeVersion = localChangeVersionRef.current;
    void api
      .getStoryHistory(storyId)
      .then((next) => {
        if (attempt === loadAttemptRef.current) {
          loadedRevisionRef.current = revisionKey;
          setHistory(
            localChangeVersionRef.current === localChangeVersion
              ? next
              : { ...next, canUndo: true },
          );
        }
      })
      .catch(() => {
        if (attempt === loadAttemptRef.current) setHistory(emptyHistory);
      });
    return () => {
      loadAttemptRef.current += 1;
    };
  }, [
    clearOptimisticGraphHistory,
    story?.capabilities?.canEdit,
    story?.id,
    story?.revision,
    storyId,
  ]);

  const markLocalChange = useCallback(
    (revision?: number, graphHistoryChange?: OptimisticGraphHistoryChange) => {
      localChangeVersionRef.current += 1;
      if (revision !== undefined) localRevisionsRef.current.add(revision);
      if (revision !== undefined && graphHistoryChange) {
        optimisticUndoRef.current = [
          ...optimisticUndoRef.current.filter((entry) => entry.revision !== revision),
          { ...graphHistoryChange, revision },
        ]
          .sort((left, right) => left.revision - right.revision)
          .slice(-maximumOptimisticGraphHistory);
        optimisticRedoRef.current = [];
      } else {
        clearOptimisticGraphHistory();
      }
      setHistory((current) => (current.canUndo ? current : { ...current, canUndo: true }));
    },
    [clearOptimisticGraphHistory],
  );

  const apply = useCallback(
    async (action: 'undo' | 'redo') => {
      if (busy) return;
      setBusy(true);
      const sourceStack = action === 'undo' ? optimisticUndoRef.current : optimisticRedoRef.current;
      const optimisticChange = sourceStack.at(-1);
      const optimisticPatch = optimisticChange?.[action];
      if (optimisticPatch) applyGraphPositions(optimisticPatch);
      try {
        const result = await trackSave(() =>
          action === 'undo' ? api.undoStoryChange(storyId) : api.redoStoryChange(storyId),
        );
        if (!result) {
          if (optimisticChange) {
            applyGraphPositions(optimisticChange[action === 'undo' ? 'redo' : 'undo']);
            clearOptimisticGraphHistory();
            try {
              replaceStory(await api.getStory(storyId));
            } catch {
              // The local rollback is still safer than leaving an unconfirmed inverse applied.
            }
          }
          return;
        }
        loadAttemptRef.current += 1;
        if ('story' in result) {
          clearOptimisticGraphHistory();
          loadedRevisionRef.current = `${result.story.id}:${result.story.revision ?? 'legacy'}`;
          replaceStory(result.story);
        } else {
          if (optimisticChange) {
            applyGraphPositions(optimisticChange[action === 'undo' ? 'redo' : 'undo']);
          }
          loadedRevisionRef.current = `${result.storyId}:${result.revision}`;
          applyGraphPositions(result.graphPositions, result);
          if (
            optimisticChange &&
            optimisticPatch &&
            graphPositionPatchesEqual(optimisticPatch, result.graphPositions)
          ) {
            sourceStack.pop();
            const destinationStack =
              action === 'undo' ? optimisticRedoRef.current : optimisticUndoRef.current;
            destinationStack.push(optimisticChange);
          } else {
            clearOptimisticGraphHistory();
          }
        }
        setHistory(result.history);
      } finally {
        setBusy(false);
      }
    },
    [applyGraphPositions, busy, clearOptimisticGraphHistory, replaceStory, storyId, trackSave],
  );

  return {
    history: story?.capabilities?.canEdit === true && story.id === storyId ? history : emptyHistory,
    historyBusy: busy,
    markLocalChange,
    undo: useCallback(() => apply('undo'), [apply]),
    redo: useCallback(() => apply('redo'), [apply]),
  };
}

function graphPositionPatchesEqual(
  left: StoryGraphPositionPatch,
  right: StoryGraphPositionPatch,
): boolean {
  const leftEntries = graphPositionPatchEntries(left);
  const rightEntries = graphPositionPatchEntries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every((entry, index) => entry === rightEntries[index])
  );
}

function graphPositionPatchEntries(patch: StoryGraphPositionPatch): string[] {
  return [
    ...patch.interactionUpdates.map(({ interactionId, position }) =>
      JSON.stringify(['interaction', interactionId, position.x, position.y]),
    ),
    ...patch.triggerUpdates.flatMap(({ interactionId, triggerIds, position }) =>
      triggerIds.map((triggerId) =>
        JSON.stringify([
          'trigger',
          interactionId,
          triggerId,
          position?.x ?? null,
          position?.y ?? null,
        ]),
      ),
    ),
  ].sort();
}
