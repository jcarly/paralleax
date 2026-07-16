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
  type Position,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';
import { api } from '../api';
import {
  findCreatedTrigger,
  getPendingConnection,
  getPendingTriggerInputConnection,
} from '../storyConnection';
import { planTriggerInputDeletion } from '../storyTriggerInput';

export function useStoryEditorPersistence(storyId: string) {
  const [story, setStory] = useState<Story>();
  const [error, setError] = useState('');
  const deletedTriggerIds = useRef(new Set<string>());
  const deletedTriggerInputKeys = useRef(new Set<string>());

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
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
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
      const pending = getPendingConnection(story, connection);
      if (!pending) return;

      const withTrigger = await api.addTrigger(storyId, pending.target.id);
      const nextTrigger = findCreatedTrigger(
        withTrigger,
        pending.target.id,
        pending.existingTriggerIds,
      );
      if (!nextTrigger) {
        setStory((current) => (current ? mergeIncomingStory(current, withTrigger) : withTrigger));
        return;
      }

      const updated = await api.updateTrigger(storyId, pending.target.id, nextTrigger.id, {
        inputInteractionIds: [pending.sourceId],
        conditions: nextTrigger.conditions,
      });
      deletedTriggerInputKeys.current.delete(`${nextTrigger.id}:${pending.sourceId}`);
      setStory((current) => (current ? mergeIncomingStory(current, updated) : updated));
    },
    [mergeIncomingStory, story, storyId],
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
      setStory((current) => (current ? mergeIncomingStory(current, updated) : updated));
    },
    [mergeIncomingStory, story, storyId],
  );

  const createRoot = useCallback(async () => {
    const next = await api.createInteraction(storyId, {
      position: story ? getNextRootPosition(story) : getNextRootPosition(emptyStory(storyId)),
    });
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }, [mergeIncomingStory, story, storyId]);

  const createChild = useCallback(
    async (parent: Interaction) => {
      if (!story) return;
      const next = await api.createInteraction(storyId, {
        parentId: parent.id,
        position: getNextChildPosition(story, parent),
      });
      setStory((current) => (current ? mergeIncomingStory(current, next) : next));
    },
    [mergeIncomingStory, story, storyId],
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
      setStory((current) => (current ? mergeIncomingStory(current, next) : next));
    },
    [mergeIncomingStory, story, storyId],
  );

  const createConnectionTrigger = useCallback(
    async (baseStory: Story, sourceId: string, targetId: string) => {
      const target = baseStory.interactions.find((interaction) => interaction.id === targetId);
      const existingTriggerIds = new Set(target?.triggers.map((trigger) => trigger.id) ?? []);
      const withTrigger = await api.addTrigger(storyId, targetId);
      const nextTrigger = findCreatedTrigger(withTrigger, targetId, existingTriggerIds);
      if (!nextTrigger) return withTrigger;

      deletedTriggerInputKeys.current.delete(`${nextTrigger.id}:${sourceId}`);
      return api.updateTrigger(storyId, targetId, nextTrigger.id, {
        inputInteractionIds: [sourceId],
        conditions: nextTrigger.conditions,
      });
    },
    [storyId],
  );

  const createParentForInteraction = useCallback(
    async (targetId: string, position?: Position) => {
      if (!story) return;
      const target = story.interactions.find((interaction) => interaction.id === targetId);
      if (!target) return;
      const existingInteractionIds = new Set(
        story.interactions.map((interaction) => interaction.id),
      );
      const withParent = await api.createInteraction(storyId, {
        position: position ?? getNextParentPosition(story, target),
      });
      const createdParent = withParent.interactions.find(
        (interaction) => !existingInteractionIds.has(interaction.id),
      );
      if (!createdParent) {
        setStory((current) => (current ? mergeIncomingStory(current, withParent) : withParent));
        return;
      }

      const nextStory = await createConnectionTrigger(withParent, createdParent.id, target.id);
      setStory((current) => (current ? mergeIncomingStory(current, nextStory) : nextStory));
    },
    [createConnectionTrigger, mergeIncomingStory, story, storyId],
  );

  async function patchInteraction(id: string, patch: InteractionContentPatch) {
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    const updated = await api.updateInteraction(storyId, id, patch);
    setStory((current) => {
      if (!current) return updated;
      return mergeIncomingStory(
        current,
        updated,
        { interactionId: id, patch },
        { preserveCurrentTriggers: true },
      );
    });
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
    deleteTrigger,
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
