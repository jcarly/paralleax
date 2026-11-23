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

export const position = z
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
    .describe(
      'Include locations, characters, stat definitions, stat assignments and item definitions (200 of each per page).',
    ),
  contextPage: page.describe(
    'Page of the context lists. While context.hasMore is true, call again with the next contextPage: nothing is dropped silently.',
  ),
});

export const getInteractionInput = z.strictObject({
  storyId: entityId,
  interactionId: entityId,
});

export const title = z.string().trim().min(1).max(200);
export const body = z
  .string()
  .max(MAX_INTERACTION_BODY_LENGTH)
  .describe(
    'Rich text as simple HTML: <p>, <br>, <strong>, <em>, <u>, <s>, <h2>, <h3>, <blockquote>, <ul>, <ol>, <li>, <a href>. Disallowed markup is removed by the API.',
  );

export const statValue = z.union([z.string().max(4000), z.number().finite(), z.boolean()]);

export const statEffect = z.strictObject({
  statId: entityId,
  itemId: entityId.optional(),
  operation: z.enum(['add', 'set']),
  value: statValue.optional(),
  expression: z.string().min(1).max(4000).optional(),
});

export const itemEffect = z.strictObject({
  itemId: entityId.optional(),
  itemDefinitionId: entityId.optional(),
  characterId: entityId.optional(),
  operation: z.enum(['obtain', 'lose']),
});

export const temporal = z.strictObject({
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

/** Fields of a Trigger condition; the batch schema allows a reference as interactionId. */
export const triggerConditionFields = {
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
};

export type ListStoriesInput = z.infer<typeof listStoriesInput>;
export type StoryStructureInput = z.infer<typeof storyStructureInput>;
export type GetInteractionInput = z.infer<typeof getInteractionInput>;
