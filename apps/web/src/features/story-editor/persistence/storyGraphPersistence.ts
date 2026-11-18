import { useCallback, useRef } from 'react';
import type { Connection } from '@xyflow/react';
import {
  deleteGraphDecorationFromStory,
  deleteInteractionFromStory,
  deleteTriggerInStory,
  diffStoryGraphPositions,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  mergeServerStory,
  updateGraphDecorationInStory,
  updateStoryGraphPositions,
  updateInteractionInStory,
  updateTriggerInStory,
  type Interaction,
  type InteractionContentPatch,
  type InteractionMutationResult,
  type Position,
  type Story,
  type StoryGraphPositionUpdates,
  type TriggerMutationResult,
  type UpdateTriggerInput,
  type UpdateGraphDecorationInput,
  findNewTriggerInputConflict,
  findTriggerConnectionConflict,
} from '@paralleax/shared';
import { api } from '../../../api';
import {
  getPendingConnection,
  getPendingConnectionConflict,
  getPendingTriggerInputConnection,
} from '../../../storyConnection';
import { planTriggerInputDeletion } from '../../../storyTriggerInput';
import {
  applyGraphDecorationResult,
  applyInteractionMutationResult,
  applyStoryMutationMetadata,
  applyTriggerMutationResult,
  findSavedInteraction,
  findSavedTrigger,
} from '../../story/storyMutationResults';
import type { MergeIncomingStory, StoryStateSetter, TrackStorySave } from './storyPersistenceTypes';

interface StoryGraphPersistenceDependencies {
  storyId: string;
  story: Story | undefined;
  setStory: StoryStateSetter;
  trackSave: TrackStorySave;
  mergeIncomingStory: MergeIncomingStory;
  deletedTriggerIdsRef: { current: Set<string> };
  deletedTriggerInputKeysRef: { current: Set<string> };
  onConnectionConflict?: (conflict: boolean) => void;
}

type StoryGraphPersistenceContext = StoryGraphPersistenceDependencies & {
  onConnectionConflict: (conflict: boolean) => void;
};

const ignoreConnectionConflict = () => {};

export function useStoryGraphPersistence(dependencies: StoryGraphPersistenceDependencies) {
  const context = {
    ...dependencies,
    onConnectionConflict: dependencies.onConnectionConflict ?? ignoreConnectionConflict,
  };
  const triggers = useStoryTriggerActions(context);
  const interactions = useStoryInteractionActions(context, triggers.createConnectionTrigger);
  const decorations = useGraphDecorationActions(context);

  return {
    saveTrigger: triggers.saveTrigger,
    moveTrigger: triggers.moveTrigger,
    saveGraphPositions: triggers.saveGraphPositions,
    deleteTrigger: triggers.deleteTrigger,
    deleteTriggerInput: triggers.deleteTriggerInput,
    connectInteractions: triggers.connectInteractions,
    connectToExistingTrigger: triggers.connectToExistingTrigger,
    createRoot: interactions.createRoot,
    createChild: interactions.createChild,
    createChildFromInteraction: interactions.createChildFromInteraction,
    createParentForInteraction: interactions.createParentForInteraction,
    patchInteraction: interactions.patchInteraction,
    deleteInteraction: interactions.deleteInteraction,
    createGraphDecoration: decorations.createGraphDecoration,
    updateGraphDecoration: decorations.updateGraphDecoration,
    deleteGraphDecoration: decorations.deleteGraphDecoration,
  };
}

function useStoryTriggerActions(dependencies: StoryGraphPersistenceContext) {
  const saveTrigger = useSaveTrigger(dependencies);
  const moveTrigger = useMoveTrigger(dependencies);
  const saveGraphPositions = useSaveGraphPositions(dependencies);
  const deleteTrigger = useDeleteTrigger(dependencies);
  const deleteTriggerInput = useDeleteTriggerInput(dependencies, saveTrigger);
  const connectInteractions = useConnectInteractions(dependencies);
  const connectExistingTriggerAction = useConnectToExistingTrigger(dependencies);
  const createConnectionTrigger = useCreateConnectionTrigger(dependencies);

  return {
    saveTrigger,
    moveTrigger,
    saveGraphPositions,
    deleteTrigger,
    deleteTriggerInput,
    connectInteractions,
    connectToExistingTrigger: connectExistingTriggerAction,
    createConnectionTrigger,
  };
}

function useSaveTrigger({
  storyId,
  story,
  setStory,
  trackSave,
  deletedTriggerInputKeysRef,
  onConnectionConflict,
}: StoryGraphPersistenceContext) {
  return useCallback(
    async (interactionId: string, triggerId: string, input: UpdateTriggerInput) => {
      const patch = input.inputInteractionIds
        ? { ...input, inputInteractionIds: [...new Set(input.inputInteractionIds)] }
        : input;
      if (patch.inputInteractionIds !== undefined && story) {
        const interaction = story.interactions.find(({ id }) => id === interactionId);
        const trigger = interaction?.triggers.find(({ id }) => id === triggerId);
        if (trigger) {
          const conflict = findNewTriggerInputConflict(
            story,
            interactionId,
            patch.inputInteractionIds,
            { triggerId, existingInputInteractionIds: trigger.inputInteractionIds },
          );
          if (conflict) {
            onConnectionConflict(true);
            return;
          }
        }
      }
      onConnectionConflict(false);
      patch.inputInteractionIds?.forEach((inputId) =>
        deletedTriggerInputKeysRef.current.delete(`${triggerId}:${inputId}`),
      );
      setStory((current) =>
        current ? updateTriggerInStory(current, interactionId, triggerId, patch) : current,
      );
      const next = await trackSave(() =>
        api.updateTrigger(storyId, interactionId, triggerId, patch),
      );
      if (!next) {
        return;
      }
      setStory((current) => (current ? applyTriggerResult(current, next) : current));
    },
    [deletedTriggerInputKeysRef, onConnectionConflict, setStory, story, storyId, trackSave],
  );
}

function useMoveTrigger({ story, storyId, setStory, trackSave }: StoryGraphPersistenceContext) {
  return async function moveTrigger(
    interactionId: string,
    triggerIds: string[],
    position: Position,
  ) {
    if (!story || triggerIds.length === 0) {
      return;
    }
    const interaction = story.interactions.find((item) => item.id === interactionId);
    const triggers = triggerIds.flatMap((triggerId) => {
      const trigger = interaction?.triggers.find((item) => item.id === triggerId);
      return trigger ? [trigger] : [];
    });
    if (triggers.length === 0) {
      return;
    }

    setStory((current) =>
      triggers.reduce(
        (nextStory, trigger) =>
          updateTriggerInStory(nextStory, interactionId, trigger.id, { position }),
        current ?? story,
      ),
    );

    for (const trigger of triggers) {
      const next = await trackSave(() =>
        api.updateTrigger(storyId, interactionId, trigger.id, { position }),
      );
      if (!next) {
        return;
      }
      setStory((current) => (current ? applyTriggerResult(current, next) : current));
    }
  };
}

function useSaveGraphPositions({
  story,
  storyId,
  setStory,
  trackSave,
}: StoryGraphPersistenceContext) {
  return async function saveGraphPositions(updates: StoryGraphPositionUpdates) {
    if (
      !story ||
      (updates.interactionUpdates.length === 0 && updates.triggerUpdates.length === 0)
    ) {
      return;
    }
    const positionedStory = updateStoryGraphPositions(story, updates);
    const redo = diffStoryGraphPositions(story, positionedStory);
    if (redo.interactionUpdates.length === 0 && redo.triggerUpdates.length === 0) {
      return;
    }
    const undo = diffStoryGraphPositions(positionedStory, story);

    setStory((current) => (current ? updateStoryGraphPositions(current, updates) : current));
    const result = await trackSave(() => api.updateStoryGraphPositions(storyId, updates), {
      graphHistoryChange: { undo, redo },
    });
    if (!result) {
      return;
    }
    setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
  };
}

function useDeleteTrigger({
  story,
  storyId,
  setStory,
  trackSave,
  deletedTriggerIdsRef,
}: StoryGraphPersistenceContext) {
  return async function deleteTrigger(interactionId: string, triggerId: string) {
    const interaction = story?.interactions.find((item) => item.id === interactionId);
    const removesTrigger = (interaction?.triggers.length ?? 0) > 1;
    if (removesTrigger) {
      deletedTriggerIdsRef.current.add(triggerId);
    }
    setStory((current) =>
      current ? deleteTriggerInStory(current, interactionId, triggerId) : current,
    );
    const next = await trackSave(() => api.deleteTrigger(storyId, interactionId, triggerId));
    if (!next) {
      return;
    }
    setStory((current) => (current ? applyStoryMutationMetadata(current, next) : current));
  };
}

function useDeleteTriggerInput(
  { story, deletedTriggerInputKeysRef }: StoryGraphPersistenceContext,
  saveTrigger: ReturnType<typeof useSaveTrigger>,
) {
  return useCallback(
    async (interactionId: string, triggerId: string, inputInteractionId: string) => {
      const plan = planTriggerInputDeletion(story, interactionId, triggerId, inputInteractionId);
      if (!plan) {
        return;
      }

      deletedTriggerInputKeysRef.current.add(`${triggerId}:${inputInteractionId}`);
      await saveTrigger(interactionId, triggerId, {
        inputInteractionIds: plan.inputInteractionIds,
      });
    },
    [deletedTriggerInputKeysRef, saveTrigger, story],
  );
}

function useConnectInteractions({
  story,
  storyId,
  setStory,
  trackSave,
  deletedTriggerInputKeysRef,
  onConnectionConflict,
}: StoryGraphPersistenceContext) {
  return useCallback(
    async (connection: Connection) => {
      if (!story) {
        return;
      }
      const conflict = getPendingConnectionConflict(story, connection);
      if (conflict) {
        onConnectionConflict(true);
        return;
      }
      const pending = getPendingConnection(story, connection);
      if (!pending) {
        return;
      }
      onConnectionConflict(false);

      const created = await trackSave(() =>
        api.addTrigger(storyId, pending.target.id, {
          inputInteractionIds: [pending.sourceId],
        }),
      );
      if (!created) {
        return;
      }
      const nextTrigger = findSavedTrigger(created, story, pending.target.id);
      if (!nextTrigger) {
        return;
      }
      deletedTriggerInputKeysRef.current.delete(`${nextTrigger.id}:${pending.sourceId}`);
      setStory((current) => (current ? applyTriggerResult(current, created) : current));
    },
    [deletedTriggerInputKeysRef, onConnectionConflict, setStory, story, storyId, trackSave],
  );
}

function useConnectToExistingTrigger({
  story,
  storyId,
  setStory,
  trackSave,
  deletedTriggerInputKeysRef,
  onConnectionConflict,
}: StoryGraphPersistenceContext) {
  return useCallback(
    (sourceId: string, targetId: string, triggerId: string) =>
      connectToExistingTrigger(
        { story, storyId, setStory, trackSave, deletedTriggerInputKeysRef, onConnectionConflict },
        sourceId,
        targetId,
        triggerId,
      ),
    [deletedTriggerInputKeysRef, onConnectionConflict, setStory, story, storyId, trackSave],
  );
}

async function connectToExistingTrigger(
  {
    story,
    storyId,
    setStory,
    trackSave,
    deletedTriggerInputKeysRef,
    onConnectionConflict,
  }: Pick<
    StoryGraphPersistenceContext,
    | 'story'
    | 'storyId'
    | 'setStory'
    | 'trackSave'
    | 'deletedTriggerInputKeysRef'
    | 'onConnectionConflict'
  >,
  sourceId: string,
  targetId: string,
  triggerId: string,
) {
  onConnectionConflict(false);
  if (story && findTriggerConnectionConflict(story, sourceId, targetId, triggerId)) {
    onConnectionConflict(true);
    return;
  }
  const pending = getPendingTriggerInputConnection(story, sourceId, targetId, triggerId);
  if (!pending) {
    return;
  }

  const inputInteractionIds = [...pending.trigger.inputInteractionIds, pending.sourceId];
  deletedTriggerInputKeysRef.current.delete(`${pending.trigger.id}:${pending.sourceId}`);
  const patch = {
    inputInteractionIds,
    conditionGroups: getTriggerConditionGroups(pending.trigger),
    appearanceProbability: getTriggerAppearanceProbability(pending.trigger),
  };
  setStory((current) =>
    current ? updateTriggerInStory(current, pending.targetId, pending.trigger.id, patch) : current,
  );
  const updated = await trackSave(() =>
    api.updateTrigger(storyId, pending.targetId, pending.trigger.id, patch),
  );
  if (!updated) {
    return;
  }
  setStory((current) => (current ? applyTriggerResult(current, updated) : current));
}

function useCreateConnectionTrigger({
  story,
  storyId,
  trackSave,
  deletedTriggerInputKeysRef,
  onConnectionConflict,
}: StoryGraphPersistenceContext) {
  return useCallback(
    async (sourceId: string, targetId: string) => {
      if (!story) {
        throw new Error('Story is not loaded');
      }
      if (findTriggerConnectionConflict(story, sourceId, targetId)) {
        onConnectionConflict(true);
        return undefined;
      }
      onConnectionConflict(false);
      const created = await trackSave(() =>
        api.addTrigger(storyId, targetId, {
          inputInteractionIds: [sourceId],
        }),
      );
      if (!created) {
        return undefined;
      }
      const trigger = findSavedTrigger(created, story, targetId);
      if (trigger) {
        deletedTriggerInputKeysRef.current.delete(`${trigger.id}:${sourceId}`);
      }
      return created;
    },
    [deletedTriggerInputKeysRef, onConnectionConflict, story, storyId, trackSave],
  );
}

function useStoryInteractionActions(
  dependencies: StoryGraphPersistenceContext,
  createConnectionTrigger: ReturnType<typeof useCreateConnectionTrigger>,
) {
  return {
    createRoot: useCreateRoot(dependencies),
    createChild: useCreateChild(dependencies),
    createChildFromInteraction: useCreateChildFromInteraction(dependencies),
    createParentForInteraction: useCreateParentForInteraction(
      dependencies,
      createConnectionTrigger,
    ),
    patchInteraction: usePatchInteraction(dependencies),
    deleteInteraction: useDeleteInteraction(dependencies),
  };
}

function useCreateRoot({ storyId, story, setStory, trackSave }: StoryGraphPersistenceContext) {
  return useCallback(
    async (position?: Position) => {
      const next = await trackSave(() =>
        api.createInteraction(storyId, {
          position:
            position ??
            (story ? getNextRootPosition(story) : getNextRootPosition(emptyStory(storyId))),
        }),
      );
      if (!next) {
        return;
      }
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
      return findSavedInteraction(next, story ?? emptyStory(storyId))?.id;
    },
    [setStory, story, storyId, trackSave],
  );
}

function useCreateChild({ storyId, story, setStory, trackSave }: StoryGraphPersistenceContext) {
  return useCallback(
    async (parent: Interaction) => {
      if (!story) {
        return;
      }
      const next = await trackSave(() =>
        api.createInteraction(storyId, {
          parentId: parent.id,
          position: getNextChildPosition(story, parent),
        }),
      );
      if (!next) {
        return;
      }
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
      return findSavedInteraction(next, story)?.id;
    },
    [setStory, story, storyId, trackSave],
  );
}

function useCreateChildFromInteraction({
  storyId,
  story,
  setStory,
  trackSave,
}: StoryGraphPersistenceContext) {
  return useCallback(
    async (sourceId: string, position?: Position) => {
      if (!story) {
        return;
      }
      const source = story.interactions.find((interaction) => interaction.id === sourceId);
      if (!source) {
        return;
      }
      const next = await trackSave(() =>
        api.createInteraction(storyId, {
          parentId: source.id,
          position: position ?? getNextChildPosition(story, source),
        }),
      );
      if (!next) {
        return;
      }
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
      return findSavedInteraction(next, story)?.id;
    },
    [setStory, story, storyId, trackSave],
  );
}

function useCreateParentForInteraction(
  { storyId, story, setStory, trackSave }: StoryGraphPersistenceContext,
  createConnectionTrigger: ReturnType<typeof useCreateConnectionTrigger>,
) {
  return useCallback(
    async (targetId: string, position?: Position) => {
      if (!story) {
        return;
      }
      const target = story.interactions.find((interaction) => interaction.id === targetId);
      if (!target) {
        return;
      }
      const withParent = await trackSave(() =>
        api.createInteraction(storyId, {
          position: position ?? getNextParentPosition(story, target),
        }),
      );
      if (!withParent) {
        return;
      }
      const parent = findSavedInteraction(withParent, story);
      if (!parent) {
        return;
      }
      const linkedTrigger = await createConnectionTrigger(parent.id, target.id);
      if (!linkedTrigger) {
        return;
      }
      setStory((current) => {
        if (!current) {
          return current;
        }
        const withCreatedParent = applyInteractionResult(current, withParent);
        return applyTriggerResult(withCreatedParent, linkedTrigger);
      });
      return parent.id;
    },
    [createConnectionTrigger, setStory, story, storyId, trackSave],
  );
}

function usePatchInteraction({ storyId, setStory, trackSave }: StoryGraphPersistenceContext) {
  const interactionSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  return function patchInteraction(id: string, patch: InteractionContentPatch): Promise<boolean> {
    let saved = false;
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    interactionSaveQueueRef.current = interactionSaveQueueRef.current.then(async () => {
      const updated = await trackSave(() => api.updateInteraction(storyId, id, patch));
      if (!updated) {
        return;
      }
      saved = true;
      setStory((current) => {
        if (!current) {
          return current;
        }
        return applyInteractionPatchResult(current, updated, id, patch);
      });
    });
    return interactionSaveQueueRef.current.then(() => saved);
  };
}

function useDeleteInteraction({ storyId, setStory, trackSave }: StoryGraphPersistenceContext) {
  return async function deleteInteraction(interactionId: string) {
    const result = await trackSave(() => api.deleteInteraction(storyId, interactionId));
    if (!result) {
      return;
    }
    setStory((current) =>
      current
        ? applyStoryMutationMetadata(
            deleteInteractionFromStory(current, result.interactionId),
            result,
          )
        : current,
    );
  };
}

function useGraphDecorationActions({ storyId, setStory, trackSave }: StoryGraphPersistenceContext) {
  return {
    createGraphDecoration: useCreateGraphDecoration(storyId, setStory, trackSave),
    updateGraphDecoration: useUpdateGraphDecoration(storyId, setStory, trackSave),
    deleteGraphDecoration: useDeleteGraphDecoration(storyId, setStory, trackSave),
  };
}

function useCreateGraphDecoration(
  storyId: string,
  setStory: StoryStateSetter,
  trackSave: TrackStorySave,
) {
  return useCallback(
    async (kind: 'frame' | 'text', position: Position) => {
      const result = await trackSave(() => api.createGraphDecoration(storyId, { kind, position }));
      if (!result) {
        return undefined;
      }
      setStory((current) => (current ? applyGraphDecorationResult(current, result) : current));
      return result.decoration.id;
    },
    [setStory, storyId, trackSave],
  );
}

function useUpdateGraphDecoration(
  storyId: string,
  setStory: StoryStateSetter,
  trackSave: TrackStorySave,
) {
  return useCallback(
    async (decorationId: string, patch: UpdateGraphDecorationInput) => {
      setStory((current) =>
        current ? updateGraphDecorationInStory(current, decorationId, patch) : current,
      );
      const result = await trackSave(() => api.updateGraphDecoration(storyId, decorationId, patch));
      if (!result) {
        return;
      }
      setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
    },
    [setStory, storyId, trackSave],
  );
}

function useDeleteGraphDecoration(
  storyId: string,
  setStory: StoryStateSetter,
  trackSave: TrackStorySave,
) {
  return useCallback(
    async (decorationId: string) => {
      setStory((current) =>
        current ? deleteGraphDecorationFromStory(current, decorationId) : current,
      );
      const result = await trackSave(() => api.deleteGraphDecoration(storyId, decorationId));
      if (!result) {
        return;
      }
      setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
    },
    [setStory, storyId, trackSave],
  );
}

function emptyStory(storyId: string): Story {
  return {
    id: storyId,
    title: '',
    interactions: [],
    createdAt: '',
    updatedAt: '',
  };
}

function applyInteractionResult(story: Story, result: InteractionMutationResult | Story): Story {
  if ('interactions' in result) {
    return mergeServerStory(story, result);
  }
  return applyInteractionMutationResult(story, result);
}

function applyTriggerResult(story: Story, result: TriggerMutationResult | Story): Story {
  if ('interactions' in result) {
    return mergeServerStory(story, result);
  }
  return applyTriggerMutationResult(story, result);
}

function applyInteractionPatchResult(
  story: Story,
  result: InteractionMutationResult | Story,
  interactionId: string,
  patch: InteractionContentPatch,
) {
  if ('interactions' in result) {
    return mergeServerStory(
      story,
      result,
      { interactionId, patch },
      { preserveCurrentTriggers: true },
    );
  }
  return applyStoryMutationMetadata(updateInteractionInStory(story, interactionId, patch), result);
}
