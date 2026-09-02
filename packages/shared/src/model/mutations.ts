import type { Character } from './characters.js';
import type { Position } from './common.js';
import type { Interaction } from './interactions.js';
import type { GraphDecoration } from './graph-decorations.js';
import type { ItemDefinition, ItemEffect, ItemInstance, ItemRelationshipType } from './items.js';
import type { Location } from './locations.js';
import type {
  StatAssignment,
  StatDefinition,
  StatEffect,
  StatValue,
  StatValueType,
} from './stats.js';
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

export interface GraphDecorationMutationResult extends StoryMutationMetadata {
  decoration: GraphDecoration;
}

export interface LocationMutationResult extends StoryMutationMetadata {
  location: Location;
}

export interface CharacterMutationResult extends StoryMutationMetadata {
  character: Character;
}

export interface CharacterStatMutationResult extends StoryMutationMetadata {
  characterId: string;
  stat: StatAssignment;
}

export interface StatAssignmentMutationResult extends StoryMutationMetadata {
  ownerType: 'story' | 'character' | 'location' | 'itemDefinition';
  ownerId?: string;
  stat: StatAssignment;
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
  conditionalTextBlocks?: Interaction['conditionalTextBlocks'];
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
  initialValue: StatValue;
}

export interface UpdateCharacterStatInput {
  initialValue?: StatValue;
}

export interface CreateStatDefinitionInput {
  name: string;
  valueType?: StatValueType;
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

export interface CreateStatAssignmentInput {
  statDefinitionId: string;
  ownerType: 'story' | 'character' | 'location' | 'itemDefinition';
  ownerId?: string;
  initialValue: StatValue;
}

export interface UpdateStatAssignmentInput {
  initialValue: StatValue;
}

export interface CreateItemDefinitionInput {
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  stats?: Array<Omit<StatAssignment, 'id'> & { id?: string }>;
}

export interface UpdateItemDefinitionInput {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  stats?: Array<Omit<StatAssignment, 'id'> & { id?: string }>;
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

export type UpdateTriggerInput = Partial<
  Pick<
    Trigger,
    | 'inputInteractionIds'
    | 'conditions'
    | 'conditionGroups'
    | 'appearanceProbability'
    | 'timerSeconds'
    | 'position'
  >
>;

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
    | 'conditionalTextBlocks'
    | 'durationMinutes'
  >
>;

export type TriggerPatch = Partial<
  Pick<
    Trigger,
    | 'inputInteractionIds'
    | 'conditions'
    | 'conditionGroups'
    | 'appearanceProbability'
    | 'timerSeconds'
    | 'position'
  >
>;
