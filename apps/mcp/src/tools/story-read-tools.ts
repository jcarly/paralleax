import { MAX_STORY_PAGE_SIZE } from '@paralleax/shared';
import type { z } from 'zod';
import { pathSegment, type ParalleaxApiClient } from '../api-client.js';
import {
  contextPageSchema,
  editorBootstrapSchema,
  interactionContentPageSchema,
  interactionPageSchema,
  storyListSchema,
  storySchema,
  triggerContentPageSchema,
  triggerPageSchema,
} from '../api-contract.js';
import { ToolError } from '../tool-result.js';
import type { GetInteractionInput, ListStoriesInput, StoryStructureInput } from './schemas.js';
import {
  interactionDetailView,
  storyContextView,
  storySummaryView,
  textExcerpt,
} from './story-projection.js';

type InteractionSummary = z.infer<typeof interactionPageSchema>['interactions'][number];
type InteractionContent = z.infer<typeof interactionContentPageSchema>['interactions'][number];
type TriggerPage = z.infer<typeof triggerPageSchema>;
type TriggerContentPage = z.infer<typeof triggerContentPageSchema>;

export function storyPath(storyId: string, suffix = ''): string {
  return `/stories/${pathSegment(storyId)}${suffix}`;
}

export async function listStories(api: ParalleaxApiClient, input: ListStoriesInput) {
  const result = await api.get('/stories', storyListSchema, {
    page: input.page,
    pageSize: input.pageSize,
    query: input.query === '' ? undefined : input.query,
    filter: input.filter,
    sort: input.sort,
  });
  return {
    stories: result.items.map(storySummaryView),
    page: result.page,
    pageSize: result.pageSize,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
  };
}

const emptyContent = {
  body: '',
  durationMinutes: 0,
  characterIds: [],
  statEffects: [],
  itemEffects: [],
  conditionalTextBlocks: [],
};

function interactionView(summary: InteractionSummary, found: InteractionContent | undefined) {
  const content = found ?? emptyContent;
  return {
    id: summary.id,
    title: summary.title,
    position: summary.position,
    locationId: summary.locationId ?? null,
    excerpt: textExcerpt(content.body),
    bodyLength: content.body.length,
    durationMinutes: content.durationMinutes,
    characterIds: content.characterIds,
    statEffects: content.statEffects,
    itemEffects: content.itemEffects,
    conditionalTextBlockCount: content.conditionalTextBlocks.length,
  };
}

function triggerViews(structure: TriggerPage, content: TriggerContentPage) {
  const contentById = new Map(content.triggers.map((item) => [item.triggerId, item]));
  return structure.triggers.map((trigger) => {
    const details = contentById.get(trigger.id);
    return {
      id: trigger.id,
      outputInteractionId: trigger.outputInteractionId,
      inputInteractionIds: trigger.inputInteractionIds,
      conditionGroups: details?.conditionGroups ?? [],
      appearanceProbability: details?.appearanceProbability ?? 100,
      timerSeconds: details?.timerSeconds ?? null,
    };
  });
}

function readStructurePages(api: ParalleaxApiClient, input: StoryStructureInput) {
  const paging = { page: input.page, pageSize: input.pageSize };
  const path = (suffix: string) => storyPath(input.storyId, `/editor${suffix}`);
  return Promise.all([
    api.get(path(''), editorBootstrapSchema),
    api.get(path('/interactions'), interactionPageSchema, paging),
    api.get(path('/content/interactions'), interactionContentPageSchema, paging),
    api.get(path('/triggers'), triggerPageSchema, paging),
    api.get(path('/content/triggers'), triggerContentPageSchema, paging),
    input.includeContext
      ? api.get(path('/context'), contextPageSchema, {
          page: input.contextPage,
          pageSize: MAX_STORY_PAGE_SIZE,
        })
      : Promise.resolve(undefined),
  ]);
}

/**
 * Reads one page of the Story graph through the paginated editor projections
 * (ADR-027), the same reads the editor uses, so large stories stay bounded.
 */
export async function getStoryStructure(api: ParalleaxApiClient, input: StoryStructureInput) {
  const [bootstrap, interactions, interactionContent, triggers, triggerContent, context] =
    await readStructurePages(api, input);
  const contentById = new Map(
    interactionContent.interactions.map((item) => [item.interactionId, item]),
  );
  const revisions = [interactions, interactionContent, triggers, triggerContent, context].map(
    (item) => item?.revision ?? bootstrap.revision,
  );
  return {
    story: {
      id: bootstrap.id,
      title: bootstrap.title,
      revision: bootstrap.revision,
      startDateTime: bootstrap.startDateTime,
      canEdit: bootstrap.capabilities?.canEdit ?? false,
      interactionCount: bootstrap.interactionCount,
      triggerCount: bootstrap.triggerCount,
      contextCounts: bootstrap.contextCounts,
    },
    page: input.page,
    pageSize: input.pageSize,
    interactions: interactions.interactions.map((summary) =>
      interactionView(summary, contentById.get(summary.id)),
    ),
    triggers: triggerViews(triggers, triggerContent),
    hasMoreInteractions: interactions.hasMore,
    hasMoreTriggers: triggers.hasMore,
    // Pages are separate reads; a concurrent edit between them is reported.
    consistentRevision: revisions.every((revision) => revision === bootstrap.revision),
    ...(context === undefined ? {} : { context: storyContextView(context, input.contextPage) }),
  };
}

export async function getInteraction(api: ParalleaxApiClient, input: GetInteractionInput) {
  const story = await api.get(storyPath(input.storyId), storySchema);
  const interaction = story.interactions.find(({ id }) => id === input.interactionId);
  if (!interaction) {
    throw new ToolError('INTERACTION_NOT_FOUND', 'Interaction not found in this story');
  }
  return interactionDetailView(story, interaction);
}
