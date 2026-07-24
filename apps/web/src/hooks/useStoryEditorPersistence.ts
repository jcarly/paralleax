import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection } from '@xyflow/react';
import {
  deleteTriggerInStory,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  mergeServerStory,
  updateInteractionInStory,
  updateTriggerInStory,
  type Interaction,
  type InteractionContentPatch,
  type InteractionMutationResult,
  type Position,
  type Story,
  type TriggerCondition,
  type TriggerMutationResult,
} from '@paralleax/shared';
import { api } from '../api';
import { getPendingConnection, getPendingTriggerInputConnection } from '../storyConnection';
import { planTriggerInputDeletion } from '../storyTriggerInput';

export function useStoryEditorPersistence(storyId: string) {
  const [story, setStory] = useState<Story>();
  const [error, setError] = useState('');
  const deletedTriggerIds = useRef(new Set<string>());
  const deletedTriggerInputKeys = useRef(new Set<string>());
  const interactionSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const mergeIncomingStory = useCallback(
    (
      current: Story,
      incoming: Story,
      edited?: { interactionId: string; patch: InteractionContentPatch },
      options: { preserveCurrentTriggers?: boolean } = {},
    ): Story =>
      mergeServerStory(current, incoming, edited, {
        ...options,
        deletedTriggerIds: deletedTriggerIds.current,
        deletedTriggerInputKeys: deletedTriggerInputKeys.current,
      }),
    [],
  );

  const load = useCallback(
    () =>
      api
        .getStory(storyId)
        .then((next) => {
          deletedTriggerIds.current.clear();
          deletedTriggerInputKeys.current.clear();
          setStory(next);
        })
        .catch((e: Error) => setError(e.message)),
    [storyId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function renameStory(title: string) {
    const next = await api.renameStory(storyId, title);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function saveTrigger(
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) {
    const nextInputs = [...new Set(inputInteractionIds)];
    nextInputs.forEach((inputId) =>
      deletedTriggerInputKeys.current.delete(`${triggerId}:${inputId}`),
    );
    const patch = { inputInteractionIds: nextInputs, conditions };
    setStory((current) =>
      current ? updateTriggerInStory(current, interactionId, triggerId, patch) : current,
    );
    const next = await api.updateTrigger(storyId, interactionId, triggerId, patch);
    setStory((current) =>
      current ? applyTriggerResult(current, next, interactionId, triggerId) : current,
    );
  }

  async function createTriggerVariant(interactionId: string, baseTriggerId: string) {
    if (!story) return undefined;
    const interaction = story.interactions.find((item) => item.id === interactionId);
    const baseTrigger = interaction?.triggers.find((trigger) => trigger.id === baseTriggerId);
    if (!interaction || !baseTrigger) return undefined;

    const candidate = story.interactions.find((item) => item.id !== interaction.id);
    if (!candidate) return undefined;

    const patch = {
      inputInteractionIds: baseTrigger.inputInteractionIds,
      conditions: [{ interactionId: candidate.id, hasBeenVisited: true }],
    };
    const created = await api.addTrigger(storyId, interactionId, patch);
    const nextTrigger = savedTrigger(created, story, interactionId);
    if (!nextTrigger) return undefined;
    patch.inputInteractionIds.forEach((inputId) =>
      deletedTriggerInputKeys.current.delete(`${nextTrigger.id}:${inputId}`),
    );
    setStory((current) =>
      current ? applyTriggerResult(current, created, interactionId, nextTrigger.id) : current,
    );
    return nextTrigger.id;
  }

  async function deleteTrigger(interactionId: string, triggerId: string) {
    const interaction = story?.interactions.find((item) => item.id === interactionId);
    const removesTrigger = (interaction?.triggers.length ?? 0) > 1;
    if (removesTrigger) {
      deletedTriggerIds.current.add(triggerId);
    }
    setStory((current) =>
      current ? deleteTriggerInStory(current, interactionId, triggerId) : current,
    );
    const next = await api.deleteTrigger(storyId, interactionId, triggerId);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function deleteTriggerVariants(interactionId: string, triggerIds: string[]) {
    if (!story || triggerIds.length === 0) return;

    let optimisticStory = story;
    for (const triggerId of triggerIds) {
      const interaction = optimisticStory.interactions.find((item) => item.id === interactionId);
      const removesTrigger = (interaction?.triggers.length ?? 0) > 1;
      if (removesTrigger) {
        deletedTriggerIds.current.add(triggerId);
      }
      optimisticStory = deleteTriggerInStory(optimisticStory, interactionId, triggerId);
    }
    setStory(optimisticStory);

    let nextStory = optimisticStory;
    for (const triggerId of triggerIds) {
      nextStory = await api.deleteTrigger(storyId, interactionId, triggerId);
    }
    setStory((current) => (current ? mergeIncomingStory(current, nextStory) : nextStory));
  }

  async function deleteTriggerInput(
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) {
    const plan = planTriggerInputDeletion(story, interactionId, triggerId, inputInteractionId);
    if (!plan) return;

    deletedTriggerInputKeys.current.add(`${triggerId}:${inputInteractionId}`);
    await saveTrigger(interactionId, triggerId, plan.inputInteractionIds, plan.conditions);
  }

  const connectInteractions = useCallback(
    async (connection: Connection) => {
      if (!story) return;
      const pending = getPendingConnection(story, connection);
      if (!pending) return;

      const created = await api.addTrigger(storyId, pending.target.id, {
        inputInteractionIds: [pending.sourceId],
        conditions: [],
      });
      const nextTrigger = savedTrigger(created, story, pending.target.id);
      if (!nextTrigger) return;
      deletedTriggerInputKeys.current.delete(`${nextTrigger.id}:${pending.sourceId}`);
      setStory((current) =>
        current ? applyTriggerResult(current, created, pending.target.id, nextTrigger.id) : current,
      );
    },
    [story, storyId],
  );

  const connectToExistingTrigger = useCallback(
    async (sourceId: string, targetId: string, triggerId: string) => {
      const pending = getPendingTriggerInputConnection(story, sourceId, targetId, triggerId);
      if (!pending) return;

      const inputInteractionIds = [...pending.trigger.inputInteractionIds, pending.sourceId];
      deletedTriggerInputKeys.current.delete(`${pending.trigger.id}:${pending.sourceId}`);
      const patch = {
        inputInteractionIds,
        conditions: pending.trigger.conditions,
      };
      setStory((current) =>
        current
          ? updateTriggerInStory(current, pending.targetId, pending.trigger.id, patch)
          : current,
      );
      const updated = await api.updateTrigger(storyId, pending.targetId, pending.trigger.id, patch);
      setStory((current) =>
        current
          ? applyTriggerResult(current, updated, pending.targetId, pending.trigger.id)
          : current,
      );
    },
    [story, storyId],
  );

  const createRoot = useCallback(async () => {
    const next = await api.createInteraction(storyId, {
      position: story ? getNextRootPosition(story) : getNextRootPosition(emptyStory(storyId)),
    });
    setStory((current) => (current ? applyInteractionResult(current, next) : current));
  }, [story, storyId]);

  const createChild = useCallback(
    async (parent: Interaction) => {
      if (!story) return;
      const next = await api.createInteraction(storyId, {
        parentId: parent.id,
        position: getNextChildPosition(story, parent),
      });
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
    },
    [story, storyId],
  );

  const createChildFromInteraction = useCallback(
    async (sourceId: string, position?: Position) => {
      if (!story) return;
      const source = story.interactions.find((interaction) => interaction.id === sourceId);
      if (!source) return;
      const next = await api.createInteraction(storyId, {
        parentId: source.id,
        position: position ?? getNextChildPosition(story, source),
      });
      setStory((current) => (current ? applyInteractionResult(current, next) : current));
    },
    [story, storyId],
  );

  const createConnectionTrigger = useCallback(
    async (sourceId: string, targetId: string) => {
      if (!story) throw new Error('Story is not loaded');
      const created = await api.addTrigger(storyId, targetId, {
        inputInteractionIds: [sourceId],
        conditions: [],
      });
      const trigger = savedTrigger(created, story, targetId);
      if (trigger) deletedTriggerInputKeys.current.delete(`${trigger.id}:${sourceId}`);
      return created;
    },
    [story, storyId],
  );

  const createParentForInteraction = useCallback(
    async (targetId: string, position?: Position) => {
      if (!story) return;
      const target = story.interactions.find((interaction) => interaction.id === targetId);
      if (!target) return;
      const withParent = await api.createInteraction(storyId, {
        position: position ?? getNextParentPosition(story, target),
      });
      const parent = savedInteraction(withParent, story);
      if (!parent) return;
      const linkedTrigger = await createConnectionTrigger(parent.id, target.id);
      setStory((current) => {
        if (!current) return current;
        const withCreatedParent = applyInteractionResult(current, withParent, parent.id);
        return applyTriggerResult(withCreatedParent, linkedTrigger, target.id);
      });
    },
    [createConnectionTrigger, story, storyId],
  );

  function patchInteraction(id: string, patch: InteractionContentPatch): Promise<void> {
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    interactionSaveQueue.current = interactionSaveQueue.current
      .then(async () => {
        const updated = await api.updateInteraction(storyId, id, patch);
        setStory((current) => {
          if (!current) return current;
          return applyInteractionPatchResult(current, updated, id, patch);
        });
      })
      .catch((e: Error) => setError(e.message));
    return interactionSaveQueue.current;
  }

  async function deleteInteraction(interactionId: string) {
    const next = await api.deleteInteraction(storyId, interactionId);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  return {
    story,
    setStory,
    error,
    renameStory,
    saveTrigger,
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

function applyMutationMetadata(
  story: Story,
  mutation: { revision: number; updatedAt: string },
): Story {
  return { ...story, revision: mutation.revision, updatedAt: mutation.updatedAt };
}

function applyInteractionResult(
  story: Story,
  result: InteractionMutationResult | Story,
  interactionId?: string,
): Story {
  if ('interactions' in result) return mergeServerStory(story, result);
  const saved = savedInteraction(result, story, interactionId);
  if (!saved) return story;
  const exists = story.interactions.some(({ id }) => id === saved.id);
  const interactions = exists
    ? story.interactions.map((interaction) => (interaction.id === saved.id ? saved : interaction))
    : [...story.interactions, saved];
  return applyMutationMetadata({ ...story, interactions }, result);
}

function applyTriggerResult(
  story: Story,
  result: TriggerMutationResult | Story,
  interactionId: string,
  triggerId?: string,
): Story {
  if ('interactions' in result) return mergeServerStory(story, result);
  const saved = savedTrigger(result, story, interactionId, triggerId);
  if (!saved) return story;
  return applyMutationMetadata(
    {
      ...story,
      interactions: story.interactions.map((interaction) => {
        if (interaction.id !== interactionId) return interaction;
        const exists = interaction.triggers.some(({ id }) => id === saved.id);
        return {
          ...interaction,
          triggers: exists
            ? interaction.triggers.map((trigger) => (trigger.id === saved.id ? saved : trigger))
            : [...interaction.triggers, saved],
        };
      }),
    },
    result,
  );
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
  return applyMutationMetadata(updateInteractionInStory(story, interactionId, patch), result);
}

function savedInteraction(
  result: InteractionMutationResult | Story,
  current: Story,
  interactionId?: string,
) {
  if (!('interactions' in result)) return result.interaction;
  if (interactionId) return result.interactions.find(({ id }) => id === interactionId);
  const currentIds = new Set(current.interactions.map(({ id }) => id));
  return result.interactions.find(({ id }) => !currentIds.has(id));
}

function savedTrigger(
  result: TriggerMutationResult | Story,
  current: Story,
  interactionId: string,
  triggerId?: string,
) {
  if (!('interactions' in result)) return result.trigger;
  const triggers = result.interactions.find(({ id }) => id === interactionId)?.triggers ?? [];
  if (triggerId) return triggers.find(({ id }) => id === triggerId);
  const currentIds = new Set(
    current.interactions.find(({ id }) => id === interactionId)?.triggers.map(({ id }) => id) ?? [],
  );
  return triggers.find(({ id }) => !currentIds.has(id));
}
