import type {
  Story,
  StoryEditorBootstrap,
  StoryEditorInteractionContentPage,
  StoryEditorInteractionPage,
  StoryEditorLoadingProjection,
  StoryEditorTriggerContentPage,
  StoryEditorTriggerPage,
} from '@paralleax/shared';
import { api } from '../../../api';
import {
  appendStoryContextPage,
  assertStoryProjectionIds,
  assertStoryProjectionPage,
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
  StoryProjectionIntegrityError,
  StoryProjectionRevisionChangedError,
  type StoryContextAccumulator,
} from '../../story/storyProjectionLoading';

const MAX_REVISION_RETRIES = 2;

export async function loadStoryEditorProjection(
  storyId: string,
  onProgress?: (projection: StoryEditorLoadingProjection) => void,
): Promise<Story> {
  for (let attempt = 0; attempt <= MAX_REVISION_RETRIES; attempt += 1) {
    try {
      return await loadConsistentStoryEditorProjection(storyId, onProgress);
    } catch (error) {
      if (
        !(error instanceof StoryProjectionRevisionChangedError) ||
        attempt === MAX_REVISION_RETRIES
      ) {
        throw error;
      }
    }
  }
  throw new StoryProjectionRevisionChangedError();
}

async function loadConsistentStoryEditorProjection(
  storyId: string,
  onProgress?: (projection: StoryEditorLoadingProjection) => void,
): Promise<Story> {
  const bootstrap = await api.getStoryEditorBootstrap(storyId);
  let story = createStoryLoadingProjection(bootstrap);
  onProgress?.({ story, phase: 'context' });

  const context = await loadContext(storyId, bootstrap);
  assertContextCounts(context, bootstrap);
  story = projectStoryContext(story, context);
  onProgress?.({ story, phase: 'interactions' });

  if (bootstrap.interactionCount > 0) {
    const interactionSummaries: StoryEditorInteractionPage['interactions'] = [];
    await readPages(
      (page) => api.getStoryEditorInteractionPage(storyId, page),
      bootstrap,
      (result) => interactionSummaries.push(...result.interactions),
      bootstrap.interactionCount,
    );
    assertStoryProjectionIds(
      'interaction structure',
      interactionSummaries.map(({ id }) => id),
      bootstrap.interactionCount,
    );
    story = {
      ...story,
      interactions: interactionSummaries.map((interaction) => ({
        ...interaction,
        body: '',
        triggers: [],
      })),
    };
  }
  onProgress?.({ story, phase: 'triggers' });

  if (bootstrap.triggerCount > 0) {
    const triggerStructures: StoryEditorTriggerPage['triggers'] = [];
    await readPages(
      (page) => api.getStoryEditorTriggerPage(storyId, page),
      bootstrap,
      (result) => triggerStructures.push(...result.triggers),
      bootstrap.triggerCount,
    );
    assertStoryProjectionIds(
      'Trigger structure',
      triggerStructures.map(({ id }) => id),
      bootstrap.triggerCount,
    );
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (
      triggerStructures.some(
        ({ outputInteractionId, inputInteractionIds }) =>
          !interactionIds.has(outputInteractionId) ||
          inputInteractionIds.some((inputInteractionId) => !interactionIds.has(inputInteractionId)),
      )
    ) {
      throw new StoryProjectionIntegrityError(
        'Trigger structure references an interaction outside the projection.',
      );
    }
    const byInteraction = groupBy(
      triggerStructures,
      ({ outputInteractionId }) => outputInteractionId,
    );
    story = {
      ...story,
      interactions: story.interactions.map((interaction) => ({
        ...interaction,
        triggers: (byInteraction.get(interaction.id) ?? []).map(
          ({ outputInteractionId: _outputInteractionId, ...trigger }) => trigger,
        ),
      })),
    };
  }
  onProgress?.({ story, phase: 'content' });

  if (bootstrap.interactionCount > 0) {
    const interactionContent = new Map<
      string,
      StoryEditorInteractionContentPage['interactions'][number]
    >();
    const interactionContentIds: string[] = [];
    await readPages(
      (page) => api.getStoryEditorInteractionContentPage(storyId, page),
      bootstrap,
      (result) => {
        for (const content of result.interactions) {
          interactionContentIds.push(content.interactionId);
          interactionContent.set(content.interactionId, content);
        }
      },
      bootstrap.interactionCount,
    );
    assertStoryProjectionIds(
      'interaction content',
      interactionContentIds,
      bootstrap.interactionCount,
      new Set(story.interactions.map(({ id }) => id)),
    );
    story = {
      ...story,
      interactions: story.interactions.map((interaction) => {
        const next = interactionContent.get(interaction.id);
        if (!next) return interaction;
        return {
          ...interaction,
          body: next.body,
          durationMinutes: next.durationMinutes,
          characterIds: next.characterIds,
          statEffects: next.statEffects,
          itemEffects: next.itemEffects,
          conditionalTextBlocks: next.conditionalTextBlocks,
        };
      }),
    };
    onProgress?.({ story, phase: 'content' });
  }

  if (bootstrap.triggerCount > 0) {
    const triggerContent = new Map<string, StoryEditorTriggerContentPage['triggers'][number]>();
    const triggerContentIds: string[] = [];
    await readPages(
      (page) => api.getStoryEditorTriggerContentPage(storyId, page),
      bootstrap,
      (result) => {
        for (const content of result.triggers) {
          triggerContentIds.push(content.triggerId);
          triggerContent.set(content.triggerId, content);
        }
      },
      bootstrap.triggerCount,
    );
    assertStoryProjectionIds(
      'Trigger content',
      triggerContentIds,
      bootstrap.triggerCount,
      new Set(story.interactions.flatMap(({ triggers }) => triggers.map(({ id }) => id))),
    );
    story = {
      ...story,
      interactions: story.interactions.map((interaction) => ({
        ...interaction,
        triggers: interaction.triggers.map((trigger) => {
          const next = triggerContent.get(trigger.id);
          if (!next) return trigger;
          return {
            ...trigger,
            conditionGroups: next.conditionGroups,
            appearanceProbability: next.appearanceProbability,
            timerSeconds: next.timerSeconds,
          };
        }),
      })),
    };
    onProgress?.({ story, phase: 'content' });
  }

  onProgress?.({ story, phase: 'ready' });
  return story;
}

async function loadContext(
  storyId: string,
  bootstrap: StoryEditorBootstrap,
): Promise<StoryContextAccumulator> {
  const context = createStoryContextAccumulator();
  const totalCount = Math.max(...Object.values(bootstrap.contextCounts));
  if (totalCount === 0) return context;
  await readPages(
    (page) => api.getStoryEditorContextPage(storyId, page),
    bootstrap,
    (result) => {
      appendStoryContextPage(context, result);
    },
    totalCount,
  );
  return context;
}

async function readPages<
  T extends { revision: number; page: number; pageSize: number; hasMore: boolean },
>(
  readPage: (page: number) => Promise<T>,
  bootstrap: StoryEditorBootstrap,
  onPage: (page: T) => void,
  totalCount?: number,
): Promise<void> {
  let pageNumber = 1;
  while (true) {
    const page = await readPage(pageNumber);
    assertStoryProjectionPage(bootstrap.revision, pageNumber, page);
    onPage(page);
    if (totalCount !== undefined) {
      const expectedHasMore = page.page * page.pageSize < totalCount;
      if (page.hasMore !== expectedHasMore) {
        throw new StoryProjectionIntegrityError(
          `page ${page.page} has inconsistent continuation metadata.`,
        );
      }
    }
    if (!page.hasMore) {
      return;
    }
    pageNumber += 1;
  }
}

function assertContextCounts(
  context: StoryContextAccumulator,
  bootstrap: StoryEditorBootstrap,
): void {
  for (const key of Object.keys(bootstrap.contextCounts) as Array<
    keyof StoryEditorBootstrap['contextCounts']
  >) {
    assertStoryProjectionIds(
      `${key} context`,
      context[key].map(({ id }) => id),
      bootstrap.contextCounts[key],
    );
  }
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(keyOf(item), [...(grouped.get(keyOf(item)) ?? []), item]);
  return grouped;
}
