import { STORY_CHANGE_ENTITY_KINDS } from '@paralleax/shared';
import { z } from 'zod';

/**
 * The parts of Paralleax API responses that the MCP server reads. Unknown
 * fields pass through untouched; nested domain values (conditions, effects)
 * are forwarded as returned. A response that no longer matches fails with
 * API_CONTRACT_MISMATCH instead of producing a misleading tool result.
 */

const position = z.looseObject({ x: z.number(), y: z.number() });
const domainList = z.array(z.unknown()).default([]);
const named = z.looseObject({ id: z.string(), name: z.string() });

export const errorBodySchema = z.looseObject({
  code: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]).optional(),
  requestId: z.string().optional(),
  details: z.unknown().optional(),
});

export const publicUserSchema = z.looseObject({ id: z.string(), displayName: z.string() });

const capabilities = z.looseObject({ canEdit: z.boolean() }).optional();

export const storyListSchema = z.looseObject({
  items: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string(),
      interactionCount: z.number(),
      revision: z.number().optional(),
      updatedAt: z.string(),
      owner: z.looseObject({ displayName: z.string() }).optional(),
      access: z.looseObject({ visibility: z.string() }).optional(),
      capabilities,
    }),
  ),
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

export const editorBootstrapSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  revision: z.number(),
  startDateTime: z.string().optional(),
  capabilities,
  interactionCount: z.number(),
  triggerCount: z.number(),
  contextCounts: z.record(z.string(), z.number()),
});

const pageMetadata = { revision: z.number(), hasMore: z.boolean() };

export const interactionPageSchema = z.looseObject({
  ...pageMetadata,
  interactions: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string(),
      position,
      locationId: z.string().nullable().optional(),
    }),
  ),
});

export const interactionContentPageSchema = z.looseObject({
  ...pageMetadata,
  interactions: z.array(
    z.looseObject({
      interactionId: z.string(),
      body: z.string(),
      durationMinutes: z.number().default(0),
      characterIds: z.array(z.string()).default([]),
      statEffects: domainList,
      itemEffects: domainList,
      conditionalTextBlocks: domainList,
    }),
  ),
});

export const triggerPageSchema = z.looseObject({
  ...pageMetadata,
  triggers: z.array(
    z.looseObject({
      id: z.string(),
      inputInteractionIds: z.array(z.string()),
      outputInteractionId: z.string(),
    }),
  ),
});

export const triggerContentPageSchema = z.looseObject({
  ...pageMetadata,
  triggers: z.array(
    z.looseObject({
      triggerId: z.string(),
      conditionGroups: domainList,
      appearanceProbability: z.number().default(100),
      timerSeconds: z.number().nullable().default(null),
    }),
  ),
});

export const contextPageSchema = z.looseObject({
  ...pageMetadata,
  locations: z.array(named),
  characters: z.array(named),
  statDefinitions: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      valueType: z.string().default('number'),
      category: z.string().optional(),
      changePerHour: z.number().optional(),
    }),
  ),
  // Required: a response without it must fail, not read as "no assignments".
  statAssignments: z.array(
    z.looseObject({
      id: z.string(),
      statDefinitionId: z.string(),
      ownerType: z.string(),
      ownerId: z.string().optional(),
      initialValue: z.union([z.number(), z.boolean(), z.string()]),
    }),
  ),
  itemDefinitions: z.array(named),
});

export const triggerSchema = z.looseObject({
  id: z.string(),
  inputInteractionIds: z.array(z.string()),
  conditionGroups: domainList,
  appearanceProbability: z.number().default(100),
  timerSeconds: z.number().nullable().default(null),
});

export const interactionSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  position,
  locationId: z.string().nullable().default(null),
  characterIds: z.array(z.string()).default([]),
  durationMinutes: z.number().default(0),
  statEffects: domainList,
  itemEffects: domainList,
  conditionalTextBlocks: domainList,
  triggers: z.array(triggerSchema),
});

export const storySchema = z.looseObject({
  id: z.string(),
  revision: z.number().optional(),
  title: z.string(),
  interactions: z.array(interactionSchema),
  locations: z.array(named).default([]),
  characters: z.array(named).default([]),
});

const diagnostic = z.looseObject({
  severity: z.enum(['error', 'warning']),
  operationIndex: z.number().nullable(),
  code: z.string(),
  message: z.string(),
});

const createdEntity = z.looseObject({
  kind: z.enum(STORY_CHANGE_ENTITY_KINDS),
  operationIndex: z.number(),
  id: z.string(),
  ref: z.string().optional(),
  interactionId: z.string().optional(),
});

const changeSummary = z.looseObject({
  counts: z.record(z.string(), z.number()),
  interactions: z.array(z.looseObject({ change: z.string(), id: z.string() })),
  triggers: z.array(z.looseObject({ change: z.string(), id: z.string() })),
  characters: z.array(z.looseObject({ change: z.string(), id: z.string() })).default([]),
  locations: z.array(z.looseObject({ change: z.string(), id: z.string() })).default([]),
  statDefinitions: z.array(z.looseObject({ change: z.string(), id: z.string() })),
  statAssignments: z.array(z.looseObject({ change: z.string(), id: z.string() })),
  connections: z.array(z.looseObject({ change: z.string() })),
});

export const storyChangePreviewSchema = z.looseObject({
  storyId: z.string(),
  baseRevision: z.number(),
  valid: z.boolean(),
  proposalId: z.string().optional(),
  expiresAt: z.string().optional(),
  operationCount: z.number(),
  createdEntities: z.array(createdEntity),
  summary: changeSummary.optional(),
  diagnostics: z.array(diagnostic),
});

export const storyChangeCommitSchema = z.looseObject({
  status: z.enum(['committed', 'already_applied']),
  storyId: z.string(),
  proposalId: z.string(),
  baseRevision: z.number(),
  revision: z.number(),
  createdEntities: z.array(createdEntity),
  summary: changeSummary.optional(),
  reverted: z.boolean().optional(),
});

export type ApiStory = z.infer<typeof storySchema>;
export type ApiInteraction = z.infer<typeof interactionSchema>;
export type ApiTrigger = z.infer<typeof triggerSchema>;
export type ApiContextPage = z.infer<typeof contextPageSchema>;
export type ApiStoryList = z.infer<typeof storyListSchema>;
export type ApiStoryChangePreview = z.infer<typeof storyChangePreviewSchema>;
