import { MAX_INTERACTION_BODY_LENGTH, MAX_STORY_PAGE_SIZE } from '@paralleax/shared';
import { z } from 'zod';

/**
 * Tool input schemas. They check shape and size before a request leaves the
 * MCP server; the Paralleax API remains the authority for every domain rule
 * (references within the Story, condition kinds, stat typing, quotas).
 */

// Identifiers become URL path segments: no dots or slashes, so no traversal.
export const entityId = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/, 'Expected a Paralleax identifier');

const idempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/)
  .optional()
  .describe(
    'Optional client-chosen key (8-128 letters, digits, "-" or "_"). Retrying a call with the same key and the same arguments returns the first result instead of writing twice.',
  );

const position = z
  .strictObject({ x: z.number().finite(), y: z.number().finite() })
  .describe('Graph position in editor canvas units.');

const page = z.number().int().min(1).max(10_000).default(1);

export const listStoriesInput = z.strictObject({
  query: z.string().trim().max(200).optional().describe('Case-insensitive title search.'),
  filter: z
    .enum(['all', 'editable', 'owned', 'commentable'])
    .default('all')
    .describe('"editable" keeps only stories the user may modify.'),
  sort: z.enum(['updated', 'title']).default('updated'),
  page,
  pageSize: z.number().int().min(1).max(50).default(24),
});

export const storyStructureInput = z.strictObject({
  storyId: entityId,
  page: page.describe('Page of interactions and of triggers, in editor order.'),
  pageSize: z.number().int().min(1).max(MAX_STORY_PAGE_SIZE).default(50),
  includeContext: z
    .boolean()
    .default(true)
    .describe('Include locations, characters, stat and item definitions (first 200 of each).'),
});

export const getInteractionInput = z.strictObject({
  storyId: entityId,
  interactionId: entityId,
});

const title = z.string().trim().min(1).max(200);
const body = z
  .string()
  .max(MAX_INTERACTION_BODY_LENGTH)
  .describe(
    'Rich text as simple HTML: <p>, <br>, <strong>, <em>, <u>, <s>, <h2>, <h3>, <blockquote>, <ul>, <ol>, <li>, <a href>. Disallowed markup is removed by the API.',
  );

export const createInteractionInput = z.strictObject({
  storyId: entityId,
  title,
  body: body.optional(),
  parentInteractionId: entityId
    .optional()
    .describe(
      'Existing interaction that leads to the new one. Its default Trigger then has this interaction as input, which creates the branch. Omit to create a root interaction.',
    ),
  position: position.optional().describe('Omit to use the editor placement rule.'),
  idempotencyKey,
});

const statValue = z.union([z.string().max(4000), z.number().finite(), z.boolean()]);

const statEffect = z.strictObject({
  statId: entityId,
  itemId: entityId.optional(),
  operation: z.enum(['add', 'set']),
  value: statValue.optional(),
  expression: z.string().min(1).max(4000).optional(),
});

const itemEffect = z.strictObject({
  itemId: entityId.optional(),
  itemDefinitionId: entityId.optional(),
  characterId: entityId.optional(),
  operation: z.enum(['obtain', 'lose']),
});

const interactionChanges = z
  .strictObject({
    title: title.optional(),
    body: body.optional(),
    durationMinutes: z.number().int().min(0).max(1_000_000).optional(),
    locationId: entityId.nullable().optional().describe('null removes the location.'),
    characterIds: z
      .array(entityId)
      .max(500)
      .optional()
      .describe('Replaces the present characters.'),
    statEffects: z.array(statEffect).max(500).optional().describe('Replaces all stat effects.'),
    itemEffects: z.array(itemEffect).max(500).optional().describe('Replaces all item effects.'),
    position: position.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'At least one change is required',
  });

export const updateInteractionInput = z.strictObject({
  storyId: entityId,
  interactionId: entityId,
  changes: interactionChanges.describe(
    'Only the listed fields change; omitted fields keep their current value.',
  ),
  idempotencyKey,
});

const temporal = z.strictObject({
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(366)
    .optional(),
  dateRanges: z
    .array(z.strictObject({ startDate: z.string(), endDate: z.string() }))
    .max(100)
    .optional(),
  weekdays: z
    .array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
    .max(7)
    .optional(),
  timeSlots: z
    .array(z.strictObject({ startTime: z.string(), endTime: z.string() }))
    .max(48)
    .optional(),
});

export const triggerCondition = z
  .strictObject({
    interactionId: entityId.optional(),
    hasBeenVisited: z.boolean().optional(),
    locationId: entityId.optional(),
    isCurrentLocation: z.boolean().optional(),
    characterId: entityId.optional(),
    isPresent: z.boolean().optional(),
    statId: entityId.optional(),
    itemId: entityId.optional(),
    operator: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']).optional(),
    value: statValue.optional(),
    comparisonStatId: entityId.optional(),
    comparisonItemId: entityId.optional(),
    expression: z.string().min(1).max(4000).optional(),
    itemDefinitionId: entityId.optional(),
    isOwned: z.boolean().optional(),
    temporal: temporal.optional(),
  })
  .describe(
    'Exactly one kind: {interactionId, hasBeenVisited} | {locationId, isCurrentLocation} | {characterId, isPresent} | {statId, operator, value | comparisonStatId | expression} | {itemDefinitionId, isOwned} | {temporal}.',
  );

const conditionGroup = z.strictObject({
  id: z.string().min(1).max(200).optional().describe('Omit to generate one.'),
  conditions: z
    .array(triggerCondition)
    .max(500)
    .describe('All conditions of a group must hold (AND).'),
});

export const createTriggerInput = z.strictObject({
  storyId: entityId,
  targetInteractionId: entityId.describe(
    'Interaction that owns the Trigger and becomes reachable through it (the output).',
  ),
  inputInteractionIds: z
    .array(entityId)
    .min(1)
    .max(50)
    .describe('Source interactions. Each one alone can lead to the target (alternatives).'),
  conditionGroups: z
    .array(conditionGroup)
    .min(1)
    .max(100)
    .optional()
    .describe('Alternative groups (OR). Omit for an unconditional connection.'),
  appearanceProbability: z.number().int().min(0).max(100).optional(),
  timerSeconds: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
  idempotencyKey,
});

export type ListStoriesInput = z.infer<typeof listStoriesInput>;
export type StoryStructureInput = z.infer<typeof storyStructureInput>;
export type GetInteractionInput = z.infer<typeof getInteractionInput>;
export type CreateInteractionInput = z.infer<typeof createInteractionInput>;
export type UpdateInteractionInput = z.infer<typeof updateInteractionInput>;
export type CreateTriggerInput = z.infer<typeof createTriggerInput>;
