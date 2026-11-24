import type { Position, StatValue } from '../model/index.js';
import type {
  CreateStatDefinitionChange,
  StoryChangeCharacterFields,
  StoryChangeInteractionFields,
  StoryChangeLocationFields,
  StoryChangeStatDefinitionFields,
} from './contract.js';

/** Interaction fields with every temporary reference and omitted ID resolved. */
export type ResolvedStoryChangeInteractionFields = Omit<
  StoryChangeInteractionFields,
  'conditionalTextBlocks' | 'locationId' | 'characterIds' | 'statEffects'
> & {
  locationId?: string | null;
  characterIds?: string[];
  /** Checked by the caller's entity validation, like any other field value. */
  statEffects?: unknown[];
  /** Checked by the caller's entity validation, like any other field value. */
  conditionalTextBlocks?: unknown[];
};

/** Trigger fields with every temporary reference and omitted ID resolved. */
export interface ResolvedStoryChangeTriggerFields {
  /** Checked by the caller's entity validation, like any other field value. */
  conditionGroups?: unknown[];
  appearanceProbability?: number;
  timerSeconds?: number | null;
  position?: Position;
}

export type ResolvedStoryChangeOperation =
  | {
      type: 'create_interaction';
      index: number;
      interactionId: string;
      triggerId: string;
      inputInteractionIds: string[];
      fields: ResolvedStoryChangeInteractionFields;
      defaultTrigger: ResolvedStoryChangeTriggerFields;
    }
  | {
      type: 'update_interaction';
      index: number;
      interactionId: string;
      fields: ResolvedStoryChangeInteractionFields;
    }
  | {
      type: 'create_trigger';
      index: number;
      interactionId: string;
      triggerId: string;
      inputInteractionIds: string[];
      fields: ResolvedStoryChangeTriggerFields;
    }
  | {
      type: 'update_trigger';
      index: number;
      interactionId: string;
      triggerId: string;
      inputInteractionIds?: string[];
      fields: ResolvedStoryChangeTriggerFields;
    }
  | {
      type: 'create_character';
      index: number;
      characterId: string;
      fields: StoryChangeCharacterFields;
    }
  | {
      type: 'update_character';
      index: number;
      characterId: string;
      fields: StoryChangeCharacterFields;
    }
  | {
      type: 'create_location';
      index: number;
      locationId: string;
      fields: StoryChangeLocationFields;
    }
  | {
      type: 'update_location';
      index: number;
      locationId: string;
      fields: StoryChangeLocationFields;
    }
  | {
      type: 'create_stat_definition';
      index: number;
      statDefinitionId: string;
      fields: CreateStatDefinitionChange['fields'];
    }
  | {
      type: 'update_stat_definition';
      index: number;
      statDefinitionId: string;
      fields: StoryChangeStatDefinitionFields;
    }
  | {
      type: 'create_stat_assignment';
      index: number;
      assignmentId: string;
      statDefinitionId: string;
      ownerType: 'story' | 'character' | 'location' | 'itemDefinition';
      ownerId?: string;
      fields: { initialValue: StatValue };
    }
  | {
      type: 'update_stat_assignment';
      index: number;
      assignmentId: string;
      fields: { initialValue: StatValue };
    };
