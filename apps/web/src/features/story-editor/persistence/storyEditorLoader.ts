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
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
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
    await readPages(
      (page) => api.getStoryEditorInteractionContentPage(storyId, page),
      bootstrap,
      (result) => {
        for (const content of result.interactions) {
          interactionContent.set(content.interactionId, content);
        }
      },
      bootstrap.interactionCount,
    );
    story = {
      ...story,
      interactions: story.interactions.map((interaction) => {
        const next = interactionContent.get(interaction.id);
        if (!next) return interaction;
        const { interactionId: _interactionId, ...fields } = next;
        return { ...interaction, ...fields };
      }),
    };
    onProgress?.({ story, phase: 'content' });
  }

  if (bootstrap.triggerCount > 0) {
    const triggerContent = new Map<string, StoryEditorTriggerContentPage['triggers'][number]>();
    await readPages(
      (page) => api.getStoryEditorTriggerContentPage(storyId, page),
      bootstrap,
      (result) => {
        for (const content of result.triggers) triggerContent.set(content.triggerId, content);
      },
      bootstrap.triggerCount,
    );
    story = {
      ...story,
      interactions: story.interactions.map((interaction) => ({
        ...interaction,
        triggers: interaction.triggers.map((trigger) => {
          const next = triggerContent.get(trigger.id);
          if (!next) return trigger;
          const { triggerId: _triggerId, ...fields } = next;
          return { ...trigger, ...fields };
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
    if (page.revision !== bootstrap.revision) throw new StoryProjectionRevisionChangedError();
    onPage(page);
    if (!page.hasMore || (totalCount !== undefined && page.page * page.pageSize >= totalCount)) {
      return;
    }
    pageNumber += 1;
  }
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(keyOf(item), [...(grouped.get(keyOf(item)) ?? []), item]);
  return grouped;
}
