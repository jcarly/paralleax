import { STORY_CHANGE_BATCH_LIMITS, STORY_CHANGE_REFERENCE_PATTERN } from '@paralleax/shared';
import { z } from 'zod';
import {
  body,
  entityId,
  itemEffect,
  position,
  statEffect,
  title,
  triggerConditionFields,
} from './schemas.js';

/*
 * Tool input schemas for change batches (ADR-050). They mirror the shared
 * operation contract for shape and size; the Paralleax API resolves references
 * and applies every domain rule.
 */

const refName = z
  .string()
  .regex(STORY_CHANGE_REFERENCE_PATTERN, 'A letter, then up to 63 letters, digits, "_" or "-"');

const reference = z
  .union([entityId, z.strictObject({ ref: refName })])
  .describe('An existing ID, or { "ref": "name" } declared by an earlier operation of the batch.');

const condition = z
  .strictObject({
    ...triggerConditionFields,
    interactionId: reference.optional(),
    locationId: reference.optional(),
    characterId: reference.optional(),
  })
  .describe(
    'interactionId, locationId and characterId accept an existing ID or { "ref" } to an entity created earlier in the batch. Exactly one kind: {interactionId, hasBeenVisited} | {locationId, isCurrentLocation} | {characterId, isPresent} | {statId, operator, value | comparisonStatId | expression} | {itemDefinitionId, isOwned} | {temporal}.',
  );

const conditionGroups = z
  .array(
    z.strictObject({
      id: z.string().min(1).max(200).optional().describe('Omit to generate one.'),
      conditions: z.array(condition).max(500).describe('All conditions must hold (AND).'),
    }),
  )
  .min(1)
  .max(100)
  .describe('Replaces every condition group. Groups are alternatives (OR).');

const triggerFields = z.strictObject({
  conditionGroups: conditionGroups.optional(),
  appearanceProbability: z.number().int().min(0).max(100).optional(),
  timerSeconds: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  position: position.optional(),
});

const interactionFields = z.strictObject({
  title: title.optional(),
  body: body.optional(),
  position: position.optional().describe('Omit to use the editor placement rule.'),
  durationMinutes: z.number().int().min(0).max(1_000_000).optional(),
  locationId: reference
    .nullable()
    .optional()
    .describe('An existing location ID or { "ref" } to a created location; null removes it.'),
  characterIds: z
    .array(reference)
    .max(500)
    .optional()
    .describe('Existing character IDs or { "ref" } to created characters; replaces the list.'),
  statEffects: z.array(statEffect).max(500).optional().describe('Replaces all stat effects.'),
  itemEffects: z.array(itemEffect).max(500).optional().describe('Replaces all item effects.'),
  conditionalTextBlocks: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200).optional(),
        conditions: z.array(condition).min(1).max(500),
      }),
    )
    .max(500)
    .optional(),
});

const contextEntityFields = {
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().describe('Plain text.'),
  category: z.string().max(100).optional().describe('An empty string removes the category.'),
  imageUrl: z.string().max(2048).optional().describe('An empty string removes the image.'),
};

const characterFields = z.strictObject({
  ...contextEntityFields,
  isPlayable: z
    .boolean()
    .optional()
    .describe('At most one character is playable: true clears the flag of the others.'),
});

const locationFields = z.strictObject(contextEntityFields);

const inputInteractions = z
  .array(reference)
  .max(500)
  .describe('Source interactions; each one alone can lead to the target (alternatives).');

const operation = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('create_interaction'),
    ref: refName.optional().describe('Name for later operations of the batch.'),
    inputInteractions: inputInteractions
      .optional()
      .describe('Sources of its default Trigger. Omit for a root interaction.'),
    fields: interactionFields.optional(),
    defaultTrigger: triggerFields
      .extend({ ref: refName.optional() })
      .optional()
      .describe('Conditions and settings of the default Trigger, and a name for it.'),
  }),
  z.strictObject({
    type: z.literal('update_interaction'),
    interaction: reference,
    fields: interactionFields.describe('Only the listed fields change.'),
  }),
  z.strictObject({
    type: z.literal('create_trigger'),
    ref: refName.optional(),
    interaction: reference.describe('Output interaction that owns the Trigger.'),
    inputInteractions,
    fields: triggerFields.optional(),
  }),
  z.strictObject({
    type: z.literal('update_trigger'),
    interaction: reference.optional().describe('Owner; optional when trigger is a { ref }.'),
    trigger: reference,
    inputInteractions: inputInteractions.optional().describe('Replaces the inputs.'),
    fields: triggerFields.optional(),
  }),
  z.strictObject({
    type: z.literal('create_character'),
    ref: refName.optional().describe('Name for later operations of the batch.'),
    fields: characterFields.describe('name is required.'),
  }),
  z.strictObject({
    type: z.literal('update_character'),
    character: reference,
    fields: characterFields.describe('Only the listed fields change.'),
  }),
  z.strictObject({
    type: z.literal('create_location'),
    ref: refName.optional().describe('Name for later operations of the batch.'),
    fields: locationFields.describe('name is required.'),
  }),
  z.strictObject({
    type: z.literal('update_location'),
    location: reference,
    fields: locationFields.describe('Only the listed fields change.'),
  }),
]);

export const previewStoryChangesInput = z.strictObject({
  storyId: entityId,
  operations: z
    .array(operation)
    .min(1)
    .max(STORY_CHANGE_BATCH_LIMITS.operations)
    .describe('Applied in order, all or nothing.'),
  expectedRevision: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Story revision the batch was written for; the preview fails if it changed.'),
});

export const commitStoryChangesInput = z.strictObject({
  storyId: entityId,
  proposalId: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .describe('proposalId returned by preview_story_changes for this story.'),
});

export type PreviewStoryChangesInput = z.infer<typeof previewStoryChangesInput>;
export type CommitStoryChangesInput = z.infer<typeof commitStoryChangesInput>;
