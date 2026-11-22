import { NotFoundException } from '@nestjs/common';
import type { Story } from '@paralleax/shared';
import type {
  CreateCharacterDto,
  CreateLocationDto,
  UpdateCharacterDto,
  UpdateLocationDto,
} from '../dto/stories.dto';

/*
 * Authoring rules for creating and editing Characters and Locations, shared by
 * the single-entity endpoints (StoryContextService) and grouped Story changes
 * (StoryChangesService, ADR-050). Each function mutates the Story it receives,
 * or throws without a partial guarantee: callers work on a disposable copy.
 */

type StoryCharacter = NonNullable<Story['characters']>[number];
type StoryLocation = NonNullable<Story['locations']>[number];
type ContextEntityInput = {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
};

export function findLocation(story: Story, id: string): StoryLocation {
  const location = (story.locations ?? []).find((item) => item.id === id);
  if (!location) {
    throw new NotFoundException('Location not found');
  }
  return location;
}

export function findCharacter(story: Story, id: string): StoryCharacter {
  const character = (story.characters ?? []).find((item) => item.id === id);
  if (!character) {
    throw new NotFoundException('Character not found');
  }
  return character;
}

export function addLocation(story: Story, locationId: string, input: CreateLocationDto): Story {
  (story.locations ??= []).push({
    id: locationId,
    name: input.name.trim(),
    description: input.description ?? '',
    ...categoryField(input.category),
    imageUrl: input.imageUrl?.trim() ?? '',
  });
  return story;
}

export function applyLocationUpdate(
  story: Story,
  locationId: string,
  input: UpdateLocationDto,
): Story {
  updateContextEntityFields(findLocation(story, locationId), input);
  return story;
}

export function addCharacter(story: Story, characterId: string, input: CreateCharacterDto): Story {
  if (input.isPlayable === true) {
    clearPlayableCharacters(story);
  }
  (story.characters ??= []).push({
    id: characterId,
    name: input.name.trim(),
    description: input.description ?? '',
    ...categoryField(input.category),
    imageUrl: input.imageUrl?.trim() ?? '',
    isPlayable: input.isPlayable ?? false,
    stats: [],
  });
  return story;
}

export function applyCharacterUpdate(
  story: Story,
  characterId: string,
  input: UpdateCharacterDto,
): Story {
  const character = findCharacter(story, characterId);
  updateContextEntityFields(character, input);
  if (input.isPlayable !== undefined) {
    if (input.isPlayable === true) {
      clearPlayableCharacters(story);
    }
    character.isPlayable = input.isPlayable;
  }
  return story;
}

/** A new entity keeps a category only when it is not blank. */
function categoryField(category: string | undefined): { category?: string } {
  const trimmed = category?.trim() ?? '';
  return trimmed === '' ? {} : { category: trimmed };
}

/** At most one Character is playable: making one playable clears the others. */
function clearPlayableCharacters(story: Story): void {
  for (const character of story.characters ?? []) {
    character.isPlayable = false;
  }
}

/** Fields common to Characters and Locations; an empty category removes it. */
function updateContextEntityFields(
  entity: StoryCharacter | StoryLocation,
  input: ContextEntityInput,
): void {
  if (input.name !== undefined) {
    entity.name = input.name.trim();
  }
  if (input.description !== undefined) {
    entity.description = input.description;
  }
  if (input.category !== undefined) {
    const category = input.category.trim();
    if (category) {
      entity.category = category;
    } else {
      delete entity.category;
    }
  }
  if (input.imageUrl !== undefined) {
    entity.imageUrl = input.imageUrl.trim();
  }
}
