import { z } from 'zod';
import type { NativeStoryContent } from './native-story.js';

// IDs become keys in reader state and history records; prototype keys are unsafe.
const id = z
  .string()
  .min(1)
  .refine((value) => !['__proto__', 'prototype', 'constructor'].includes(value));
const position = z.strictObject({ x: z.number(), y: z.number() });
const statValue = z.union([z.number(), z.boolean(), z.string()]);
const statAssignment = z.strictObject({ id, statDefinitionId: id, initialValue: statValue });
const statDefinition = z.strictObject({
  id,
  name: z.string(),
  valueType: z.enum(['number', 'boolean', 'string']).optional(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  changePerHour: z.number().optional(),
});
const itemInstance = z.strictObject({
  id,
  itemDefinitionId: id,
  parentItemId: id.optional(),
  relationshipType: z
    .enum(['contained', 'equipped', 'attached', 'part_of', 'installed', 'worn', 'held'])
    .optional(),
  slotKey: z.string().optional(),
});
const contextFields = {
  id,
  name: z.string(),
  description: z.string(),
  category: z.string().optional(),
  imageUrl: z.string().optional(),
  stats: z.array(statAssignment).optional(),
};
const location = z.strictObject({ ...contextFields, items: z.array(itemInstance).optional() });
const character = z.strictObject({
  ...contextFields,
  items: z.array(itemInstance).optional(),
  isPlayable: z.boolean().optional(),
});
const itemDefinition = z.strictObject(contextFields);
const temporal = z.strictObject({
  dates: z.array(z.string()).optional(),
  dateRanges: z.array(z.strictObject({ startDate: z.string(), endDate: z.string() })).optional(),
  weekdays: z
    .array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
    .optional(),
  timeSlots: z.array(z.strictObject({ startTime: z.string(), endTime: z.string() })).optional(),
});
const statConditionFields = {
  statId: id,
  itemId: id.optional(),
  operator: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']),
};
const condition = z.union([
  z.strictObject({ interactionId: id, hasBeenVisited: z.boolean() }),
  z.strictObject({ locationId: id, isCurrentLocation: z.boolean() }),
  z.strictObject({ characterId: id, isPresent: z.boolean() }),
  z.strictObject({ itemDefinitionId: id, isOwned: z.boolean() }),
  z.strictObject({ temporal }),
  z.strictObject({ ...statConditionFields, value: statValue }),
  z.strictObject({ ...statConditionFields, expression: z.string() }),
  z.strictObject({ ...statConditionFields, comparisonStatId: id, comparisonItemId: id.optional() }),
]);
const conditionGroup = z.strictObject({ id, conditions: z.array(condition) });
const trigger = z.strictObject({
  id,
  probabilityKey: z.string().optional(),
  inputInteractionIds: z.array(id),
  conditions: z.array(condition).optional(),
  conditionGroups: z.array(conditionGroup).optional(),
  appearanceProbability: z.number().optional(),
  timerSeconds: z.number().nullable().optional(),
  position: position.optional(),
});
const statEffect = z.strictObject({
  statId: id,
  itemId: id.optional(),
  operation: z.enum(['add', 'set']),
  value: statValue.optional(),
  expression: z.string().optional(),
});
const itemEffect = z.strictObject({
  itemId: id.optional(),
  itemDefinitionId: id.optional(),
  characterId: id.optional(),
  operation: z.enum(['obtain', 'lose']),
});
const interaction = z.strictObject({
  id,
  title: z.string(),
  body: z.string(),
  position,
  locationId: id.nullable().optional(),
  characterIds: z.array(id).optional(),
  statEffects: z.array(statEffect).optional(),
  itemEffects: z.array(itemEffect).optional(),
  conditionalTextBlocks: z.array(z.strictObject({ id, conditions: z.array(condition) })).optional(),
  durationMinutes: z.number().optional(),
  triggers: z.array(trigger),
});
const group = z.strictObject({
  id,
  title: z.string(),
  interactionIds: z.array(id),
  parentGroupId: id.optional(),
});
const decoration = z.discriminatedUnion('kind', [
  z.strictObject({
    id,
    kind: z.literal('frame'),
    position,
    color: z.string(),
    width: z.number(),
    height: z.number(),
  }),
  z.strictObject({
    id,
    kind: z.literal('text'),
    position,
    color: z.string(),
    text: z.string(),
    fontSize: z.number(),
    fontFamily: z.enum(['sans', 'serif', 'monospace', 'display']),
    fontWeight: z.enum(['normal', 'bold']),
    fontStyle: z.enum(['normal', 'italic']),
  }),
]);

/** Shape and primitive types only. Domain invariants and references require further validation. */
export const nativeStoryContentSchema = z.strictObject({
  title: z.string(),
  startDateTime: z.string().optional(),
  interactions: z.array(interaction),
  locations: z.array(location).optional(),
  characters: z.array(character).optional(),
  stats: z.array(statAssignment).optional(),
  statDefinitions: z.array(statDefinition).optional(),
  itemDefinitions: z.array(itemDefinition).optional(),
  groups: z.array(group).optional(),
  graphDecorations: z.array(decoration).optional(),
}) satisfies z.ZodType<NativeStoryContent>;
