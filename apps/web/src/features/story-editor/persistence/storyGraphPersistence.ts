import { useCallback, useRef } from 'react';
import type { Connection } from '@xyflow/react';
import {
  deleteGraphDecorationFromStory,
  deleteTriggerInStory,
  diffStoryGraphPositions,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
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
  type TriggerCondition,
  type TriggerMutationResult,
  type UpdateGraphDecorationInput,
} from '@paralleax/shared';
import { api } from '../../../api';
import { getPendingConnection, getPendingTriggerInputConnection } from '../../../storyConnection';
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
}

export function useStoryGraphPersistence({
  storyId,
  story,
  setStory,
  trackSave,
  mergeIncomingStory,
  deletedTriggerIdsRef,
  deletedTriggerInputKeysRef,
}: StoryGraphPersistenceDependencies) {
  const interactionSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTrigger = useCallback(
    async (
      interactionId: string,
      triggerId: string,
      inputInteractionIds: string[],
      conditions: TriggerCondition[],
    ) => {
      const nextInputs = [...new Set(inputInteractionIds)];
      nextInputs.forEach((inputId) =>
        deletedTriggerInputKeysRef.current.delete(`${triggerId}:${inputId}`),
      );
      const patch = { inputInteractionIds: nextInputs, conditions };
      setStory((current) =>
        current ? updateTriggerInStory(current, interactionId, triggerId, patch) : current,
      );
      const next = await trackSave(() =>
        api.updateTrigger(storyId, interactionId, triggerId, patch),
      );
      if (!next) return;
      setStory((current) => (current ? applyTriggerResult(current, next) : current));
    },
    [deletedTriggerInputKeysRef, setStory, storyId, trackSave],
  );

  async function moveTrigger(interactionId: string, triggerIds: string[], position: Position) {
    if (!story || triggerIds.length === 0) return;
    const interaction = story.interactions.find((item) => item.id === interactionId);
    const triggers = triggerIds.flatMap((triggerId) => {
      const trigger = interaction?.triggers.find((item) => item.id === triggerId);
      return trigger ? [trigger] : [];
    });
    if (triggers.length === 0) return;

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
      if (!next) return;
      setStory((current) => (current ? applyTriggerResult(current, next) : current));
    }
  }

  async function saveGraphPositions(updates: StoryGraphPositionUpdates) {
    if (
      !story ||
      (updates.interactionUpdates.length === 0 && updates.triggerUpdates.length === 0)
    ) {
      return;
    }
    const positionedStory = updateStoryGraphPositions(story, updates);
    const redo = diffStoryGraphPositions(story, positionedStory);
    if (redo.interactionUpdates.length === 0 && redo.triggerUpdates.length === 0) return;
    const undo = diffStoryGraphPositions(positionedStory, story);

    setStory((current) => (current ? updateStoryGraphPositions(current, updates) : current));
    const result = await trackSave(() => api.updateStoryGraphPositions(storyId, updates), {
      graphHistoryChange: { undo, redo },
    });
    if (!result) return;
    setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
  }

  async function createTriggerVariant(interactionId: string, baseTriggerId: string) {
    if (!story) return undefined;
    const interaction = story.interactions.find((item) => item.id === interactionId);
    const baseTrigger = interaction?.triggers.find((trigger) => trigger.id === baseTriggerId);
    if (!interaction || !baseTrigger) return undefined;

    const patch = {
      inputInteractionIds: baseTrigger.inputInteractionIds,
      conditions: [],
      ...(baseTrigger.position ? { position: baseTrigger.position } : {}),
    };
    const created = await trackSave(() => api.addTrigger(storyId, interactionId, patch));
    if (!created) return undefined;
    const nextTrigger = findSavedTrigger(created, story, interactionId);
    if (!nextTrigger) return undefined;
    patch.inputInteractionIds.forEach((inputId) =>
      deletedTriggerInputKeysRef.current.delete(`${nextTrigger.id}:${inputId}`),
    );
    setStory((current) => (current ? applyTriggerResult(current, created) : current));
    return nextTrigger.id;
  }

  async function deleteTrigger(interactionId: string, triggerId: string) {
    const interaction = story?.interactions.find((item) => item.id === interactionId);
    const removesTrigger = (interaction?.triggers.length ?? 0) > 1;
    if (removesTrigger) {
      deletedTriggerIdsRef.current.add(triggerId);
    }
    setStory((current) =>
      current ? deleteTriggerInStory(current, interactionId, triggerId) : current,
    );
    const next = await trackSave(() => api.deleteTrigger(storyId, interactionId, triggerId));
    if (!next) return;
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function deleteTriggerVariants(interactionId: string, triggerIds: string[]) {
    if (!story || triggerIds.length === 0) return;

    let optimisticStory = story;
    for (const triggerId of triggerIds) {
      const interaction = optimisticStory.interactions.find((item) => item.id === interactionId);
      const removesTrigger = (interaction?.triggers.length ?? 0) > 1;
      if (removesTrigger) {
        deletedTriggerIdsRef.current.add(triggerId);
      }
      optimisticStory = deleteTriggerInStory(optimisticStory, interactionId, triggerId);
    }
    setStory(optimisticStory);

    let nextStory = optimisticStory;
    for (const triggerId of triggerIds) {
      const deleted = await trackSave(() => api.deleteTrigger(storyId, interactionId, triggerId));
      if (!deleted) return;
      nextStory = deleted;
    }
    setStory((current) => (current ? mergeIncomingStory(current, nextStory) : nextStory));
  }

  const deleteTriggerInput = useCallback(
    async (interactionId: string, triggerId: string, inputInteractionId: string) => {
      const plan = planTriggerInputDeletion(story, interactionId, triggerId, inputInteractionId);
      if (!plan) return;

      deletedTriggerInputKeysRef.current.add(`${triggerId}:${inputInteractionId}`);
      await saveTrigger(interactionId, triggerId, plan.inputInteractionIds, plan.conditions);
    },
    [deletedTriggerInputKeysRef, saveTrigger, story],
  );

  const connectInteractions = useCallback(
    async (connection: Connection) => {
      if (!story) return;
      const pending = getPendingConnection(story, connection);
      if (!pending) return;

      const created = await trackSave(() =>
        api.addTrigger(storyId, pending.target.id, {
          inputInteractionIds: [pending.sourceId],
          conditions: [],
        }),
      );
      if (!created) return;
      const nextTrigger = findSavedTrigger(created, story, pending.target.id);
      if (!nextTrigger) return;
      deletedTriggerInputKeysRef.current.delete(`${nextTrigger.id}:${pending.sourceId}`);
      setStory((current) => (current ? applyTriggerResult(current, created) : current));
    },
    [deletedTriggerInputKeysRef, setStory, story, storyId, trackSave],
  );

  const connectToExistingTrigger = useCallback(
    async (sourceId: string, targetId: string, triggerId: string) => {
      const pending = getPendingTriggerInputConnection(story, sourceId, targetId, triggerId);
      if (!pending) return;

      const inputInteractionIds = [...pending.trigger.inputInteractionIds, pending.sourceId];
      deletedTriggerInputKeysRef.current.delete(`${pending.trigger.id}:${pending.sourceId}`);
      const patch = {
        inputInteractionIds,
        conditions: pending.trigger.conditions,
      };
      setStory((current) =>
        current
          ? updateTriggerInStory(current, pending.targetId, pending.trigger.id, patch)
          : current,
      );
      const updated = await trackSave(() =>
        api.updateTrigger(storyId, pending.targetId, pending.trigger.id, patch),
      );
      if (!updated) return;
      setStory((current) => (current ? applyTriggerResult(current, updated) : current));
    },
    [deletedTriggerInputKeysRef, setStory, story, storyId, trackSave],
  );

  const createRoot = useCallback(
    async (position?: Position) => {
      const next = await trackSave(() =>
        api.createInteraction(storyId, {
          position:
            position ??
            (story ? getNextRootPosition(story) : getNextRootPosition(emptyStory(storyId))),
        }),
      );
      if (!next) return;
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
    },
    [setStory, story, storyId, trackSave],
  );

  const createChild = useCallback(
    async (parent: Interaction) => {
      if (!story) return;
      const next = await trackSave(() =>
        api.createInteraction(storyId, {
          parentId: parent.id,
          position: getNextChildPosition(story, parent),
        }),
      );
      if (!next) return;
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
    },
    [setStory, story, storyId, trackSave],
  );

  const createChildFromInteraction = useCallback(
    async (sourceId: string, position?: Position) => {
      if (!story) return;
      const source = story.interactions.find((interaction) => interaction.id === sourceId);
      if (!source) return;
      const next = await trackSave(() =>
        api.createInteraction(storyId, {
          parentId: source.id,
          position: position ?? getNextChildPosition(story, source),
        }),
      );
      if (!next) return;
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
    },
    [setStory, story, storyId, trackSave],
  );

  const createConnectionTrigger = useCallback(
    async (sourceId: string, targetId: string) => {
      if (!story) throw new Error('Story is not loaded');
      const created = await trackSave(() =>
        api.addTrigger(storyId, targetId, {
          inputInteractionIds: [sourceId],
          conditions: [],
        }),
      );
      if (!created) return undefined;
      const trigger = findSavedTrigger(created, story, targetId);
      if (trigger) deletedTriggerInputKeysRef.current.delete(`${trigger.id}:${sourceId}`);
      return created;
    },
    [deletedTriggerInputKeysRef, story, storyId, trackSave],
  );

  const createParentForInteraction = useCallback(
    async (targetId: string, position?: Position) => {
      if (!story) return;
      const target = story.interactions.find((interaction) => interaction.id === targetId);
      if (!target) return;
      const withParent = await trackSave(() =>
        api.createInteraction(storyId, {
          position: position ?? getNextParentPosition(story, target),
        }),
      );
      if (!withParent) return;
      const parent = findSavedInteraction(withParent, story);
      if (!parent) return;
      const linkedTrigger = await createConnectionTrigger(parent.id, target.id);
      if (!linkedTrigger) return;
      setStory((current) => {
        if (!current) return current;
        const withCreatedParent = applyInteractionResult(current, withParent);
        return applyTriggerResult(withCreatedParent, linkedTrigger);
      });
    },
    [createConnectionTrigger, setStory, story, storyId, trackSave],
  );

  function patchInteraction(id: string, patch: InteractionContentPatch): Promise<void> {
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    interactionSaveQueueRef.current = interactionSaveQueueRef.current.then(async () => {
      const updated = await trackSave(() => api.updateInteraction(storyId, id, patch));
      if (!updated) return;
      setStory((current) => {
        if (!current) return current;
        return applyInteractionPatchResult(current, updated, id, patch);
      });
    });
    return interactionSaveQueueRef.current;
  }

  async function deleteInteraction(interactionId: string) {
    const next = await trackSave(() => api.deleteInteraction(storyId, interactionId));
    if (!next) return;
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  const createGraphDecoration = useCallback(
    async (kind: 'frame' | 'text', position: Position) => {
      const result = await trackSave(() => api.createGraphDecoration(storyId, { kind, position }));
      if (!result) return undefined;
      setStory((current) => (current ? applyGraphDecorationResult(current, result) : current));
      return result.decoration.id;
    },
    [setStory, storyId, trackSave],
  );

  const updateGraphDecoration = useCallback(
    async (decorationId: string, patch: UpdateGraphDecorationInput) => {
      setStory((current) =>
        current ? updateGraphDecorationInStory(current, decorationId, patch) : current,
      );
      const result = await trackSave(() => api.updateGraphDecoration(storyId, decorationId, patch));
      if (!result) return;
      setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
    },
    [setStory, storyId, trackSave],
  );

  const deleteGraphDecoration = useCallback(
    async (decorationId: string) => {
      setStory((current) =>
        current ? deleteGraphDecorationFromStory(current, decorationId) : current,
      );
      const result = await trackSave(() => api.deleteGraphDecoration(storyId, decorationId));
      if (!result) return;
      setStory((current) => (current ? mergeIncomingStory(current, result) : result));
    },
    [mergeIncomingStory, setStory, storyId, trackSave],
  );

  return {
    saveTrigger,
    moveTrigger,
    saveGraphPositions,
    createTriggerVariant,
    deleteTrigger,
    deleteTriggerVariants,
    deleteTriggerInput,
    connectInteractions,
    connectToExistingTrigger,
    createRoot,
    createChild,
    createChildFromInteraction,
    createParentForInteraction,
    patchInteraction,
    deleteInteraction,
    createGraphDecoration,
    updateGraphDecoration,
    deleteGraphDecoration,
  };
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
  if ('interactions' in result) return mergeServerStory(story, result);
  return applyInteractionMutationResult(story, result);
}

function applyTriggerResult(story: Story, result: TriggerMutationResult | Story): Story {
  if ('interactions' in result) return mergeServerStory(story, result);
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
