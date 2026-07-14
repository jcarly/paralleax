import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection } from '@xyflow/react';
import {
  deleteTriggerInStory,
  getNextChildPosition,
  mergeServerStory,
  updateInteractionInStory,
  updateTriggerInStory,
  type Interaction,
  type InteractionContentPatch,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';
import { api } from '../api';
import { findCreatedTrigger, getPendingConnection } from '../storyConnection';
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
    deletedTriggerIds.current.add(triggerId);
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

  async function createRoot() {
    const next = await api.createInteraction(storyId, { position: { x: 100, y: 120 } });
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function createChild(parent: Interaction) {
    if (!story) return;
    const next = await api.createInteraction(storyId, {
      parentId: parent.id,
      position: getNextChildPosition(story, parent),
    });
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

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
    createRoot,
    createChild,
    patchInteraction,
    deleteInteraction,
  };
}
