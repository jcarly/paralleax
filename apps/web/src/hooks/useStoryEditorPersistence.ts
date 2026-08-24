import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection } from '@xyflow/react';
import {
  deleteTriggerInStory,
  deleteGraphDecorationFromStory,
  getStatValueType,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  mergeServerStory,
  updateInteractionInStory,
  updateGraphDecorationInStory,
  updateTriggerInStory,
  type CharacterMutationResult,
  type CharacterItemMutationResult,
  type CharacterStatMutationResult,
  type CreateStatDefinitionInput,
  type Interaction,
  type InteractionContentPatch,
  type InteractionMutationResult,
  type GraphDecorationMutationResult,
  type ItemDefinitionMutationResult,
  type LocationMutationResult,
  type MoveItemInstanceInput,
  type StatDefinitionMutationResult,
  type Position,
  type Story,
  type TriggerCondition,
  type TriggerMutationResult,
  type UpdateGraphDecorationInput,
} from '@paralleax/shared';
import { api } from '../api';
import { getPendingConnection, getPendingTriggerInputConnection } from '../storyConnection';
import { planTriggerInputDeletion } from '../storyTriggerInput';
import { useStoryRealtime, type StoryRealtimeInvalidation } from './useStoryRealtime';

export function useStoryEditorPersistence(storyId: string) {
  const [story, setStory] = useState<Story>();
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveAttempt = useRef(0);
  const deletedTriggerIds = useRef(new Set<string>());
  const deletedTriggerInputKeys = useRef(new Set<string>());
  const interactionSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const loadAttempt = useRef(0);
  const activeSaveCount = useRef(0);
  const localEditDepth = useRef(0);
  const pendingRealtimeInvalidation = useRef<StoryRealtimeInvalidation | undefined>(undefined);
  const realtimeRefresh = useRef<(invalidation: StoryRealtimeInvalidation) => void>(() => {});

  const flushPendingRealtimeRefresh = useCallback(() => {
    if (activeSaveCount.current > 0 || localEditDepth.current > 0) return;
    const pending = pendingRealtimeInvalidation.current;
    if (!pending) return;
    pendingRealtimeInvalidation.current = undefined;
    realtimeRefresh.current(pending);
  }, []);

  const trackSave = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      const attempt = ++saveAttempt.current;
      activeSaveCount.current += 1;
      setError('');
      setSaveStatus('saving');
      try {
        const result = await operation();
        if (attempt === saveAttempt.current) setSaveStatus('saved');
        return result;
      } catch (caught) {
        if (attempt === saveAttempt.current) {
          setError(caught instanceof Error ? caught.message : 'The story could not be saved.');
          setSaveStatus('error');
        }
        return undefined;
      } finally {
        activeSaveCount.current = Math.max(0, activeSaveCount.current - 1);
        flushPendingRealtimeRefresh();
      }
    },
    [flushPendingRealtimeRefresh],
  );

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

  const load = useCallback(() => {
    const attempt = ++loadAttempt.current;
    return api
      .getStory(storyId)
      .then((next) => {
        if (attempt !== loadAttempt.current) return;
        deletedTriggerIds.current.clear();
        deletedTriggerInputKeys.current.clear();
        setStory(next);
        setError('');
        setSaveStatus('idle');
      })
      .catch((e: Error) => {
        if (attempt !== loadAttempt.current) return;
        setError(e.message);
        setSaveStatus('error');
      });
  }, [storyId]);

  const refreshFromRealtime = useCallback(
    (invalidation: StoryRealtimeInvalidation) => {
      if (activeSaveCount.current > 0 || localEditDepth.current > 0) {
        pendingRealtimeInvalidation.current = prioritizeInvalidation(
          pendingRealtimeInvalidation.current,
          invalidation,
        );
        return;
      }

      const attempt = ++loadAttempt.current;
      void api
        .getStory(storyId)
        .then((next) => {
          if (attempt !== loadAttempt.current) return;
          if (activeSaveCount.current > 0 || localEditDepth.current > 0) {
            pendingRealtimeInvalidation.current = prioritizeInvalidation(
              pendingRealtimeInvalidation.current,
              invalidation,
            );
            return;
          }
          deletedTriggerIds.current.clear();
          deletedTriggerInputKeys.current.clear();
          setStory(next);
          setError('');
        })
        .catch((caught: unknown) => {
          if (attempt !== loadAttempt.current) return;
          if (invalidation === 'deleted' || isApiNotFound(caught)) {
            setStory(undefined);
            setError(caught instanceof Error ? caught.message : 'Story not found');
            setSaveStatus('error');
          }
        });
    },
    [storyId],
  );

  useEffect(() => {
    realtimeRefresh.current = refreshFromRealtime;
  }, [refreshFromRealtime]);

  const realtimeStatus = useStoryRealtime(
    storyId,
    story?.capabilities?.canEdit === true,
    refreshFromRealtime,
  );

  const beginLocalEdit = useCallback(() => {
    localEditDepth.current += 1;
  }, []);

  const endLocalEdit = useCallback(() => {
    localEditDepth.current = Math.max(0, localEditDepth.current - 1);
    setTimeout(flushPendingRealtimeRefresh, 0);
  }, [flushPendingRealtimeRefresh]);

  useEffect(() => {
    void load();
    return () => {
      loadAttempt.current += 1;
    };
  }, [load]);

  async function renameStory(title: string) {
    const next = await trackSave(() => api.renameStory(storyId, title));
    if (!next) return;
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function updateStoryStartDateTime(startDateTime: string) {
    const next = await trackSave(() => api.updateStory(storyId, { startDateTime }));
    if (!next) return;
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  const saveTrigger = useCallback(
    async (
      interactionId: string,
      triggerId: string,
      inputInteractionIds: string[],
      conditions: TriggerCondition[],
    ) => {
      const nextInputs = [...new Set(inputInteractionIds)];
      nextInputs.forEach((inputId) =>
        deletedTriggerInputKeys.current.delete(`${triggerId}:${inputId}`),
      );
      const patch = { inputInteractionIds: nextInputs, conditions };
      setStory((current) =>
        current ? updateTriggerInStory(current, interactionId, triggerId, patch) : current,
      );
      const next = await trackSave(() =>
        api.updateTrigger(storyId, interactionId, triggerId, patch),
      );
      if (!next) return;
      setStory((current) =>
        current ? applyTriggerResult(current, next, interactionId, triggerId) : current,
      );
    },
    [storyId, trackSave],
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
      setStory((current) =>
        current ? applyTriggerResult(current, next, interactionId, trigger.id) : current,
      );
    }
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
        deletedTriggerIds.current.add(triggerId);
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

      deletedTriggerInputKeys.current.add(`${triggerId}:${inputInteractionId}`);
      await saveTrigger(interactionId, triggerId, plan.inputInteractionIds, plan.conditions);
    },
    [saveTrigger, story],
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
      const nextTrigger = savedTrigger(created, story, pending.target.id);
      if (!nextTrigger) return;
      deletedTriggerInputKeys.current.delete(`${nextTrigger.id}:${pending.sourceId}`);
      setStory((current) =>
        current ? applyTriggerResult(current, created, pending.target.id, nextTrigger.id) : current,
      );
    },
    [story, storyId, trackSave],
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
      const updated = await trackSave(() =>
        api.updateTrigger(storyId, pending.targetId, pending.trigger.id, patch),
      );
      if (!updated) return;
      setStory((current) =>
        current
          ? applyTriggerResult(current, updated, pending.targetId, pending.trigger.id)
          : current,
      );
    },
    [story, storyId, trackSave],
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
    [story, storyId, trackSave],
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
    [story, storyId, trackSave],
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
    [story, storyId, trackSave],
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
      const trigger = savedTrigger(created, story, targetId);
      if (trigger) deletedTriggerInputKeys.current.delete(`${trigger.id}:${sourceId}`);
      return created;
    },
    [story, storyId, trackSave],
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
      const parent = savedInteraction(withParent, story);
      if (!parent) return;
      const linkedTrigger = await createConnectionTrigger(parent.id, target.id);
      if (!linkedTrigger) return;
      setStory((current) => {
        if (!current) return current;
        const withCreatedParent = applyInteractionResult(current, withParent, parent.id);
        return applyTriggerResult(withCreatedParent, linkedTrigger, target.id);
      });
    },
    [createConnectionTrigger, story, storyId, trackSave],
  );

  function patchInteraction(id: string, patch: InteractionContentPatch): Promise<void> {
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    interactionSaveQueue.current = interactionSaveQueue.current.then(async () => {
      const updated = await trackSave(() => api.updateInteraction(storyId, id, patch));
      if (!updated) return;
      setStory((current) => {
        if (!current) return current;
        return applyInteractionPatchResult(current, updated, id, patch);
      });
    });
    return interactionSaveQueue.current;
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
    [storyId, trackSave],
  );

  const updateGraphDecoration = useCallback(
    async (decorationId: string, patch: UpdateGraphDecorationInput) => {
      setStory((current) =>
        current ? updateGraphDecorationInStory(current, decorationId, patch) : current,
      );
      const result = await trackSave(() => api.updateGraphDecoration(storyId, decorationId, patch));
      if (!result) return;
      setStory((current) => (current ? applyMutationMetadata(current, result) : current));
    },
    [storyId, trackSave],
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
    [mergeIncomingStory, storyId, trackSave],
  );

  async function createLocation() {
    const result = await trackSave(() =>
      api.createLocation(storyId, { name: 'New location', description: '' }),
    );
    if (!result) return undefined;
    setStory((current) => (current ? applyLocationResult(current, result) : current));
    return result.location.id;
  }

  async function updateLocation(
    locationId: string,
    patch: Partial<
      Pick<LocationMutationResult['location'], 'name' | 'description' | 'category' | 'imageUrl'>
    >,
  ) {
    setStory((current) =>
      current
        ? {
            ...current,
            locations: (current.locations ?? []).map((location) =>
              location.id === locationId ? { ...location, ...patch } : location,
            ),
          }
        : current,
    );
    const result = await trackSave(() => api.updateLocation(storyId, locationId, patch));
    if (!result) return;
    setStory((current) =>
      current ? applyLocationPatchResult(current, result, locationId, patch) : current,
    );
  }

  async function createCharacter() {
    const result = await trackSave(() =>
      api.createCharacter(storyId, { name: 'New character', description: '' }),
    );
    if (!result) return undefined;
    setStory((current) => (current ? applyCharacterResult(current, result) : current));
    return result.character.id;
  }

  async function updateCharacter(
    characterId: string,
    patch: Partial<
      Pick<
        CharacterMutationResult['character'],
        'name' | 'description' | 'category' | 'imageUrl' | 'isPlayable'
      >
    >,
  ) {
    setStory((current) =>
      current
        ? {
            ...current,
            characters: (current.characters ?? []).map((character) =>
              character.id === characterId
                ? { ...character, ...patch }
                : patch.isPlayable
                  ? { ...character, isPlayable: false }
                  : character,
            ),
          }
        : current,
    );
    const result = await trackSave(() => api.updateCharacter(storyId, characterId, patch));
    if (!result) return;
    setStory((current) =>
      current ? applyCharacterPatchResult(current, result, characterId, patch) : current,
    );
  }

  async function createCharacterStat(characterId: string, statDefinitionId: string) {
    const definition = story?.statDefinitions?.find(({ id }) => id === statDefinitionId);
    const valueType = definition ? getStatValueType(definition) : 'number';
    const result = await trackSave(() =>
      api.createCharacterStat(storyId, characterId, {
        statDefinitionId,
        initialValue: valueType === 'number' ? 0 : valueType === 'boolean' ? false : '',
      }),
    );
    if (!result) return;
    setStory((current) => (current ? applyCharacterStatResult(current, result) : current));
  }

  async function updateCharacterStat(
    characterId: string,
    statId: string,
    patch: Partial<Pick<CharacterStatMutationResult['stat'], 'initialValue'>>,
  ) {
    setStory((current) =>
      current ? updateLocalCharacterStat(current, characterId, statId, patch) : current,
    );
    const result = await trackSave(() =>
      api.updateCharacterStat(storyId, characterId, statId, patch),
    );
    if (!result) return;
    setStory((current) =>
      current
        ? applyMutationMetadata(
            updateLocalCharacterStat(current, characterId, statId, patch),
            result,
          )
        : current,
    );
  }

  async function deleteCharacterStat(characterId: string, statId: string) {
    const result = await trackSave(() => api.deleteCharacterStat(storyId, characterId, statId));
    if (!result) return;
    setStory((current) => (current ? mergeServerStory(current, result) : current));
  }

  async function createStatDefinition(input: CreateStatDefinitionInput) {
    const result = await trackSave(() => api.createStatDefinition(storyId, input));
    if (!result) return undefined;
    setStory((current) =>
      current
        ? applyMutationMetadata(
            {
              ...current,
              statDefinitions: [...(current.statDefinitions ?? []), result.statDefinition],
            },
            result,
          )
        : current,
    );
    return result.statDefinition.id;
  }

  async function updateStatDefinition(
    statDefinitionId: string,
    patch: Partial<StatDefinitionMutationResult['statDefinition']>,
  ) {
    setStory((current) =>
      current
        ? {
            ...current,
            statDefinitions: (current.statDefinitions ?? []).map((definition) =>
              definition.id === statDefinitionId ? { ...definition, ...patch } : definition,
            ),
          }
        : current,
    );
    const result = await trackSave(() =>
      api.updateStatDefinition(storyId, statDefinitionId, patch),
    );
    if (!result) return;
    setStory((current) => (current ? applyMutationMetadata(current, result) : current));
  }

  async function createItemDefinition() {
    const result = await trackSave(() =>
      api.createItemDefinition(storyId, { name: 'New item', description: '' }),
    );
    if (!result) return undefined;
    setStory((current) =>
      current
        ? applyMutationMetadata(
            {
              ...current,
              itemDefinitions: [...(current.itemDefinitions ?? []), result.itemDefinition],
            },
            result,
          )
        : current,
    );
    return result.itemDefinition.id;
  }

  async function updateItemDefinition(
    itemDefinitionId: string,
    patch: Partial<
      Pick<
        ItemDefinitionMutationResult['itemDefinition'],
        'name' | 'description' | 'category' | 'imageUrl' | 'stats'
      >
    >,
  ) {
    setStory((current) =>
      current
        ? {
            ...current,
            itemDefinitions: (current.itemDefinitions ?? []).map((definition) =>
              definition.id === itemDefinitionId ? { ...definition, ...patch } : definition,
            ),
          }
        : current,
    );
    const result = await trackSave(() =>
      api.updateItemDefinition(storyId, itemDefinitionId, patch),
    );
    if (!result) return;
    setStory((current) => (current ? applyMutationMetadata(current, result) : current));
  }

  async function createCharacterItem(characterId: string, itemDefinitionId: string) {
    const result = await trackSave(() =>
      api.createCharacterItem(storyId, characterId, { itemDefinitionId }),
    );
    if (!result) return;
    setStory((current) => (current ? applyCharacterItemResult(current, result) : current));
  }

  async function deleteCharacterItem(characterId: string, itemId: string) {
    const result = await trackSave(() => api.deleteCharacterItem(storyId, characterId, itemId));
    if (!result) return;
    setStory((current) => (current ? mergeServerStory(current, result) : current));
  }

  async function moveItemInstance(itemId: string, placement: MoveItemInstanceInput) {
    const result = await trackSave(() => api.moveItemInstance(storyId, itemId, placement));
    if (!result) return;
    setStory((current) => (current ? mergeServerStory(current, result) : current));
  }

  return {
    story,
    setStory,
    error,
    saveStatus,
    realtimeStatus,
    beginLocalEdit,
    endLocalEdit,
    retry: load,
    renameStory,
    updateStoryStartDateTime,
    saveTrigger,
    moveTrigger,
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
    createLocation,
    updateLocation,
    createCharacter,
    updateCharacter,
    createStatDefinition,
    updateStatDefinition,
    createItemDefinition,
    updateItemDefinition,
    createCharacterStat,
    updateCharacterStat,
    deleteCharacterStat,
    createCharacterItem,
    deleteCharacterItem,
    moveItemInstance,
  };
}

function prioritizeInvalidation(
  current: StoryRealtimeInvalidation | undefined,
  incoming: StoryRealtimeInvalidation,
): StoryRealtimeInvalidation {
  if (current === 'deleted' || incoming === 'deleted') return 'deleted';
  if (current === 'changed' || incoming === 'changed') return 'changed';
  return 'ready';
}

function isApiNotFound(caught: unknown): boolean {
  return (
    caught instanceof Error &&
    'status' in caught &&
    typeof caught.status === 'number' &&
    caught.status === 404
  );
}

function applyGraphDecorationResult(story: Story, result: GraphDecorationMutationResult): Story {
  const exists = (story.graphDecorations ?? []).some(({ id }) => id === result.decoration.id);
  return applyMutationMetadata(
    {
      ...story,
      graphDecorations: exists
        ? (story.graphDecorations ?? []).map((decoration) =>
            decoration.id === result.decoration.id ? result.decoration : decoration,
          )
        : [...(story.graphDecorations ?? []), result.decoration],
    },
    result,
  );
}

function applyLocationResult(story: Story, result: LocationMutationResult): Story {
  const exists = (story.locations ?? []).some(({ id }) => id === result.location.id);
  return applyMutationMetadata(
    {
      ...story,
      locations: exists
        ? (story.locations ?? []).map((location) =>
            location.id === result.location.id ? result.location : location,
          )
        : [...(story.locations ?? []), result.location],
    },
    result,
  );
}

function applyLocationPatchResult(
  story: Story,
  result: LocationMutationResult,
  locationId: string,
  patch: Partial<
    Pick<LocationMutationResult['location'], 'name' | 'description' | 'category' | 'imageUrl'>
  >,
): Story {
  return applyMutationMetadata(
    {
      ...story,
      locations: (story.locations ?? []).map((location) =>
        location.id === locationId ? { ...location, ...patch } : location,
      ),
    },
    result,
  );
}

function applyCharacterResult(story: Story, result: CharacterMutationResult): Story {
  const exists = (story.characters ?? []).some(({ id }) => id === result.character.id);
  return applyMutationMetadata(
    {
      ...story,
      characters: exists
        ? (story.characters ?? []).map((character) =>
            character.id === result.character.id ? result.character : character,
          )
        : [...(story.characters ?? []), result.character],
    },
    result,
  );
}

function applyCharacterPatchResult(
  story: Story,
  result: CharacterMutationResult,
  characterId: string,
  patch: Partial<
    Pick<
      CharacterMutationResult['character'],
      'name' | 'description' | 'category' | 'imageUrl' | 'isPlayable'
    >
  >,
): Story {
  return applyMutationMetadata(
    {
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === characterId ? { ...character, ...patch } : character,
      ),
    },
    result,
  );
}

function applyCharacterStatResult(story: Story, result: CharacterStatMutationResult): Story {
  return applyMutationMetadata(
    {
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === result.characterId
          ? { ...character, stats: [...(character.stats ?? []), result.stat] }
          : character,
      ),
    },
    result,
  );
}

function applyCharacterItemResult(story: Story, result: CharacterItemMutationResult): Story {
  return applyMutationMetadata(
    {
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === result.characterId
          ? { ...character, items: [...(character.items ?? []), result.item] }
          : character,
      ),
    },
    result,
  );
}

function updateLocalCharacterStat(
  story: Story,
  characterId: string,
  statId: string,
  patch: Partial<Pick<CharacterStatMutationResult['stat'], 'initialValue'>>,
) {
  return {
    ...story,
    characters: (story.characters ?? []).map((character) =>
      character.id === characterId
        ? {
            ...character,
            stats: (character.stats ?? []).map((stat) =>
              stat.id === statId ? { ...stat, ...patch } : stat,
            ),
          }
        : character,
    ),
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
