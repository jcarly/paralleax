import {
  getStatValueType,
  mergeServerStory,
  type CreateStatDefinitionInput,
  type MoveItemInstanceInput,
  type Story,
} from '@paralleax/shared';
import { api } from '../../../api';
import {
  applyCharacterItemResult,
  applyCharacterPatchResult,
  applyCharacterResult,
  applyCharacterStatResult,
  applyLocationPatchResult,
  applyLocationResult,
  applyStoryMutationMetadata,
  addLocalItemDefinition,
  addLocalStatDefinition,
  updateLocalCharacter,
  updateLocalCharacterStat,
  updateLocalItemDefinition,
  updateLocalLocation,
  updateLocalStatDefinition,
  type CharacterPatch,
  type CharacterStatPatch,
  type ItemDefinitionPatch,
  type LocationPatch,
  type StatDefinitionPatch,
} from '../../story/storyMutationResults';
import type { StoryStateSetter, TrackStorySave } from './storyPersistenceTypes';

interface StoryContextPersistenceDependencies {
  storyId: string;
  story: Story | undefined;
  setStory: StoryStateSetter;
  trackSave: TrackStorySave;
}

export function useStoryContextPersistence({
  storyId,
  story,
  setStory,
  trackSave,
}: StoryContextPersistenceDependencies) {
  async function createLocation() {
    const result = await trackSave(() =>
      api.createLocation(storyId, { name: 'New location', description: '' }),
    );
    if (!result) return undefined;
    setStory((current) => (current ? applyLocationResult(current, result) : current));
    return result.location.id;
  }

  async function updateLocation(locationId: string, patch: LocationPatch) {
    setStory((current) => (current ? updateLocalLocation(current, locationId, patch) : current));
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

  async function updateCharacter(characterId: string, patch: CharacterPatch) {
    setStory((current) => (current ? updateLocalCharacter(current, characterId, patch) : current));
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
    patch: CharacterStatPatch,
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
        ? applyStoryMutationMetadata(
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
        ? applyStoryMutationMetadata(addLocalStatDefinition(current, result.statDefinition), result)
        : current,
    );
    return result.statDefinition.id;
  }

  async function updateStatDefinition(statDefinitionId: string, patch: StatDefinitionPatch) {
    setStory((current) =>
      current ? updateLocalStatDefinition(current, statDefinitionId, patch) : current,
    );
    const result = await trackSave(() =>
      api.updateStatDefinition(storyId, statDefinitionId, patch),
    );
    if (!result) return;
    setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
  }

  async function createItemDefinition() {
    const result = await trackSave(() =>
      api.createItemDefinition(storyId, { name: 'New item', description: '' }),
    );
    if (!result) return undefined;
    setStory((current) =>
      current
        ? applyStoryMutationMetadata(addLocalItemDefinition(current, result.itemDefinition), result)
        : current,
    );
    return result.itemDefinition.id;
  }

  async function updateItemDefinition(itemDefinitionId: string, patch: ItemDefinitionPatch) {
    setStory((current) =>
      current ? updateLocalItemDefinition(current, itemDefinitionId, patch) : current,
    );
    const result = await trackSave(() =>
      api.updateItemDefinition(storyId, itemDefinitionId, patch),
    );
    if (!result) return;
    setStory((current) => (current ? applyStoryMutationMetadata(current, result) : current));
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
