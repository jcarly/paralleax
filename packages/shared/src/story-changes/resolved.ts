import type { Position } from '../model/index.js';
import type {
  StoryChangeCharacterFields,
  StoryChangeInteractionFields,
  StoryChangeLocationFields,
} from './contract.js';

/** Interaction fields with every temporary reference and omitted ID resolved. */
export type ResolvedStoryChangeInteractionFields = Omit<
  StoryChangeInteractionFields,
  'conditionalTextBlocks' | 'locationId' | 'characterIds'
> & {
  locationId?: string | null;
  characterIds?: string[];
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
    };
