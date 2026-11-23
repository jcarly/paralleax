import type { ItemEffect, Position, StatEffect } from '../model/index.js';
import type { TriggerCondition } from '../triggers/conditions.js';

/**
 * Versioned contract for a batch of editorial operations on one Story
 * (ADR-050). The batch is provider-neutral: the editor, imports, tests and the
 * MCP adapter can all produce it. It is a list of explicit domain operations,
 * never a generic JSON patch or a whole-Story replacement.
 */
export const STORY_CHANGE_BATCH_VERSION = 1;

export const STORY_CHANGE_BATCH_LIMITS = {
  /** Operations in one batch. */
  operations: 100,
  /** Temporary references declared in one batch. */
  references: 100,
  /** Characters kept for one string value shown in a change summary. */
  summaryTextLength: 2_000,
  /** Serialized characters kept for one structured value in a change summary. */
  summaryValueLength: 4_000,
  /** Diagnostics returned for one batch. */
  diagnostics: 200,
} as const;

/** A temporary reference name: a letter, then letters, digits, `_` or `-`. */
export const STORY_CHANGE_REFERENCE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * Either the ID of an entity that already exists in the Story, or a temporary
 * reference declared by an earlier operation of the same batch.
 */
export type StoryChangeReference = string | { ref: string };

/**
 * Condition fields that name a Story entity, and the kind of entity each one
 * names. A batch may give a temporary reference in any of them. Statistics and
 * items extend this table when their operations exist.
 */
export const STORY_CHANGE_CONDITION_REFERENCE_KINDS = {
  interactionId: 'interaction',
  characterId: 'character',
  locationId: 'location',
} as const satisfies Record<string, StoryChangeEntityKind>;

type WithReferences<Condition> = Omit<
  Condition,
  keyof typeof STORY_CHANGE_CONDITION_REFERENCE_KINDS
> & {
  [
    Field in keyof typeof STORY_CHANGE_CONDITION_REFERENCE_KINDS & keyof Condition
  ]: StoryChangeReference;
};

/** A Trigger condition whose entity targets may be temporary references. */
export type StoryChangeCondition = TriggerCondition extends infer Condition
  ? Condition extends unknown
    ? WithReferences<Condition>
    : never
  : never;

export interface StoryChangeConditionGroup {
  /** Generated when omitted. */
  id?: string;
  conditions: StoryChangeCondition[];
}

export interface StoryChangeConditionalTextBlock {
  /** Generated when omitted. */
  id?: string;
  conditions: StoryChangeCondition[];
}

/** Interaction fields an operation may set. Omitted fields are left unchanged. */
export interface StoryChangeInteractionFields {
  title?: string;
  /** HTML body, sanitized by the server. */
  body?: string | null;
  position?: Position;
  /** An existing ID or a temporary reference; null removes the location. */
  locationId?: StoryChangeReference | null;
  /** Existing IDs or temporary references; replaces the characters. */
  characterIds?: StoryChangeReference[];
  statEffects?: StatEffect[];
  itemEffects?: ItemEffect[];
  conditionalTextBlocks?: StoryChangeConditionalTextBlock[];
  durationMinutes?: number;
}

/** Trigger fields an operation may set. Omitted fields are left unchanged. */
export interface StoryChangeTriggerFields {
  /** Replaces every condition group. Groups are alternatives (OR). */
  conditionGroups?: StoryChangeConditionGroup[];
  appearanceProbability?: number;
  timerSeconds?: number | null;
  position?: Position;
}

export interface CreateInteractionChange {
  type: 'create_interaction';
  /** Temporary reference to the created Interaction. */
  ref?: string;
  /** Input Interactions of its default Trigger: alternative sources of the branch. */
  inputInteractions?: StoryChangeReference[];
  fields?: StoryChangeInteractionFields;
  /** Settings of the default Trigger, and a temporary reference to it. */
  defaultTrigger?: StoryChangeTriggerFields & { ref?: string };
}

export interface UpdateInteractionChange {
  type: 'update_interaction';
  interaction: StoryChangeReference;
  fields: StoryChangeInteractionFields;
}

export interface CreateTriggerChange {
  type: 'create_trigger';
  /** Temporary reference to the created Trigger. */
  ref?: string;
  /** The output Interaction that owns the Trigger. */
  interaction: StoryChangeReference;
  inputInteractions?: StoryChangeReference[];
  fields?: StoryChangeTriggerFields;
}

export interface UpdateTriggerChange {
  type: 'update_trigger';
  /** Owner of the Trigger. May be omitted when `trigger` is a temporary reference. */
  interaction?: StoryChangeReference;
  trigger: StoryChangeReference;
  /** Replaces the input Interactions. */
  inputInteractions?: StoryChangeReference[];
  fields?: StoryChangeTriggerFields;
}

/**
 * Fields shared by characters and locations, with the limits of the editor
 * DTOs. Omitted fields are left unchanged; an empty `category` removes it.
 */
export interface StoryChangeContextEntityFields {
  name?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
}

/** Character fields an operation may set. */
export interface StoryChangeCharacterFields extends StoryChangeContextEntityFields {
  /** Making a character playable clears the flag of every other character. */
  isPlayable?: boolean;
}

/** Location fields an operation may set. */
export type StoryChangeLocationFields = StoryChangeContextEntityFields;

export interface CreateCharacterChange {
  type: 'create_character';
  /** Temporary reference to the created Character. */
  ref?: string;
  /** `name` is required, as for the editor. */
  fields: StoryChangeCharacterFields & { name: string };
}

export interface UpdateCharacterChange {
  type: 'update_character';
  character: StoryChangeReference;
  fields: StoryChangeCharacterFields;
}

export interface CreateLocationChange {
  type: 'create_location';
  /** Temporary reference to the created Location. */
  ref?: string;
  /** `name` is required, as for the editor. */
  fields: StoryChangeLocationFields & { name: string };
}

export interface UpdateLocationChange {
  type: 'update_location';
  location: StoryChangeReference;
  fields: StoryChangeLocationFields;
}

export type StoryChangeOperation =
  | CreateInteractionChange
  | UpdateInteractionChange
  | CreateTriggerChange
  | UpdateTriggerChange
  | CreateCharacterChange
  | UpdateCharacterChange
  | CreateLocationChange
  | UpdateLocationChange;

export type StoryChangeOperationType = StoryChangeOperation['type'];

export const STORY_CHANGE_OPERATION_TYPES = [
  'create_interaction',
  'update_interaction',
  'create_trigger',
  'update_trigger',
  'create_character',
  'update_character',
  'create_location',
  'update_location',
] as const satisfies readonly StoryChangeOperationType[];

export interface StoryChangeBatch {
  version: typeof STORY_CHANGE_BATCH_VERSION;
  /** The Story revision the batch was written against, when known. */
  baseRevision?: number;
  operations: StoryChangeOperation[];
}

export type StoryChangeDiagnosticSeverity = 'error' | 'warning';

export interface StoryChangeDiagnostic {
  severity: StoryChangeDiagnosticSeverity;
  /** Index of the operation concerned, or null for the batch as a whole. */
  operationIndex: number | null;
  code: string;
  message: string;
  /** Location inside the operation, for example `fields.title`. */
  path?: string;
  details?: Record<string, unknown>;
}

export const STORY_CHANGE_ENTITY_KINDS = [
  'interaction',
  'trigger',
  'character',
  'location',
] as const;

export type StoryChangeEntityKind = (typeof STORY_CHANGE_ENTITY_KINDS)[number];

/** An entity created by the batch. */
export interface StoryChangeCreatedEntity {
  kind: StoryChangeEntityKind;
  operationIndex: number;
  id: string;
  ref?: string;
  /** Owning Interaction of a created Trigger. */
  interactionId?: string;
}
