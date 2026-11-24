import { STORY_CHANGE_BATCH_LIMITS, STORY_CHANGE_REFERENCE_PATTERN } from '@paralleax/shared';
import { z } from 'zod';
import {
  body,
  entityId,
  itemEffect,
  position,
  statEffect,
  statValue,
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
    statId: reference.optional(),
    comparisonStatId: reference.optional(),
  })
  .describe(
    'interactionId, locationId, characterId, statId and comparisonStatId accept an existing ID or { "ref" } to an entity of that kind created earlier in the batch. statId and comparisonStatId name a stat ASSIGNMENT, never a definition. Exactly one kind: {interactionId, hasBeenVisited} | {locationId, isCurrentLocation} | {characterId, isPresent} | {statId, operator, value | comparisonStatId | expression} | {itemDefinitionId, isOwned} | {temporal}.',
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
  statEffects: z
    .array(statEffect.extend({ statId: reference }))
    .max(500)
    .optional()
    .describe(
      'Replaces all stat effects. statId names a stat ASSIGNMENT: an existing ID or { "ref" } to one created earlier. Send the existing effects again to keep them.',
    ),
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
  name: z.string().min(1).max(200),
  description: z.string().optional().describe('Plain text.'),
  category: z.string().max(100).optional().describe('An empty string removes the category.'),
  imageUrl: z.string().max(2048).optional().describe('An empty string removes the image.'),
};
const characterOnlyFields = {
  isPlayable: z
    .boolean()
    .optional()
    .describe('At most one character is playable: true clears the flag of the others.'),
};

/** Creation requires a name, as the editor does; an update changes only the listed fields. */
const characterFields = z.strictObject({ ...contextEntityFields, ...characterOnlyFields });
const characterUpdateFields = characterFields.partial();
const locationFields = z.strictObject(contextEntityFields);
const locationUpdateFields = locationFields.partial();

const statDefinitionFields = z.strictObject({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional().describe('An empty string removes the category.'),
  imageUrl: z.string().max(2048).optional().describe('An empty string removes the image.'),
  changePerHour: z
    .number()
    .finite()
    .optional()
    .describe('Numeric definitions only; applies to every assignment. 0 removes it.'),
});
const statDefinitionUpdateFields = statDefinitionFields.partial();
const initialValue = z.strictObject({
  initialValue: statValue.describe("A value of the definition's type: number, boolean or string."),
});

const statOwner = z
  .discriminatedUnion('type', [
    z.strictObject({ type: z.literal('story') }),
    z.strictObject({ type: z.literal('character'), id: reference }),
    z.strictObject({ type: z.literal('location'), id: reference }),
    z.strictObject({
      type: z.literal('itemDefinition'),
      id: entityId.describe('An existing item definition ID: batches create no items.'),
    }),
  ])
  .describe(
    'Who owns the assignment. A character or location may be a { "ref" } to an earlier creation.',
  );

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
    fields: characterUpdateFields.describe('Only the listed fields change.'),
  }),
  z.strictObject({
    type: z.literal('create_location'),
    ref: refName.optional().describe('Name for later operations of the batch.'),
    fields: locationFields.describe('name is required.'),
  }),
  z.strictObject({
    type: z.literal('update_location'),
    location: reference,
    fields: locationUpdateFields.describe('Only the listed fields change.'),
  }),
  z.strictObject({
    type: z.literal('create_stat_definition'),
    ref: refName
      .optional()
      .describe('Name for the DEFINITION; use another name for its assignments.'),
    fields: statDefinitionFields.extend({
      valueType: z.enum(['number', 'boolean', 'string']).describe('Required and fixed for good.'),
    }),
  }),
  z.strictObject({
    type: z.literal('update_stat_definition'),
    statDefinition: reference.describe('An existing definition ID or a { "ref" } to a definition.'),
    fields: statDefinitionUpdateFields.describe('Only the listed fields change; the type cannot.'),
  }),
  z.strictObject({
    type: z.literal('create_stat_assignment'),
    ref: refName.optional().describe('Name for the ASSIGNMENT, used in effects and conditions.'),
    statDefinition: reference.describe(
      'The definition: an existing ID or a { "ref" } to a definition.',
    ),
    owner: statOwner,
    fields: initialValue.describe('One assignment per definition and owner.'),
  }),
  z.strictObject({
    type: z.literal('update_stat_assignment'),
    assignment: reference.describe('An existing assignment ID or a { "ref" } to an assignment.'),
    fields: initialValue.describe('Changes the authored initial value, never the runtime value.'),
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
