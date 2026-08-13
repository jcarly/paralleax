import type { Character } from './characters.js';
import type { Position } from './common.js';
import type { TriggerCondition } from '../triggers/conditions.js';
import type { Interaction } from './interactions.js';
import type {
  ItemDefinition,
  ItemDefinitionStat,
  ItemEffect,
  ItemInstance,
  ItemRelationshipType,
  ItemStatEffect,
} from './items.js';
import type { Location } from './locations.js';
import type { CharacterStat, StatDefinition, StatEffect } from './stats.js';
import type { Trigger } from './triggers.js';

export interface StoryMutationMetadata {
  revision: number;
  updatedAt: string;
}

export interface InteractionMutationResult extends StoryMutationMetadata {
  interaction: Interaction;
}

export interface TriggerMutationResult extends StoryMutationMetadata {
  interactionId: string;
  trigger: Trigger;
}

export interface LocationMutationResult extends StoryMutationMetadata {
  location: Location;
}

export interface CharacterMutationResult extends StoryMutationMetadata {
  character: Character;
}

export interface CharacterStatMutationResult extends StoryMutationMetadata {
  characterId: string;
  stat: CharacterStat;
}

export interface StatDefinitionMutationResult extends StoryMutationMetadata {
  statDefinition: StatDefinition;
}

export interface ItemDefinitionMutationResult extends StoryMutationMetadata {
  itemDefinition: ItemDefinition;
}

export interface CharacterItemMutationResult extends StoryMutationMetadata {
  characterId: string;
  item: ItemInstance;
}

export interface CreateStoryInput {
  title: string;
}

export interface UpdateStoryInput {
  title?: string;
  startDateTime?: string;
}

export interface CreateInteractionInput {
  parentId?: string;
  position?: Position;
}

export interface UpdateInteractionInput {
  title?: string;
  body?: string | null;
  position?: Position;
  locationId?: string | null;
  characterIds?: string[];
  statEffects?: StatEffect[];
  itemEffects?: ItemEffect[];
  itemStatEffects?: ItemStatEffect[];
  durationMinutes?: number;
}

export interface CreateLocationInput {
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
}

export interface UpdateLocationInput {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
}

export interface CreateCharacterInput {
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  isPlayable?: boolean;
}

export interface UpdateCharacterInput {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  isPlayable?: boolean;
}

export interface CreateCharacterStatInput {
  statDefinitionId: string;
  initialValue: number;
}

export interface UpdateCharacterStatInput {
  initialValue?: number;
}

export interface CreateStatDefinitionInput {
  name: string;
  category?: string;
  imageUrl?: string;
  changePerHour?: number;
}

export interface UpdateStatDefinitionInput {
  name?: string;
  category?: string;
  imageUrl?: string;
  changePerHour?: number;
}

export interface CreateItemDefinitionInput {
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  stats?: ItemDefinitionStat[];
}

export interface UpdateItemDefinitionInput {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  stats?: ItemDefinitionStat[];
}

export interface CreateCharacterItemInput {
  itemDefinitionId: string;
}

export interface MoveItemInstanceInput {
  characterId?: string;
  locationId?: string;
  parentItemId?: string;
  relationshipType?: ItemRelationshipType;
  slotKey?: string;
}

export interface UpdateTriggerInput {
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}

export type InteractionContentPatch = Partial<
  Pick<
    Interaction,
    | 'title'
    | 'body'
    | 'position'
    | 'locationId'
    | 'characterIds'
    | 'statEffects'
    | 'itemEffects'
    | 'itemStatEffects'
    | 'durationMinutes'
  >
>;

export type TriggerPatch = Pick<Trigger, 'inputInteractionIds' | 'conditions'>;
