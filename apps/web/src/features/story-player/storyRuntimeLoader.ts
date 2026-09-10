import {
  MAX_STORY_PAGE_SIZE,
  STORY_EDITOR_PAGE_SIZE,
  type Interaction,
  type Story,
  type StoryRuntimeBootstrap,
  type StoryRuntimeSlice,
} from '@paralleax/shared';
import { api } from '../../api';
import {
  appendStoryContextPage,
  assertStoryProjectionIds,
  assertStoryProjectionPage,
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
  StoryProjectionIntegrityError,
} from '../story/storyProjectionLoading';

const runtimeReference = Symbol('runtimeInteractionReference');
type RuntimeInteractionProjection = Interaction & { [runtimeReference]?: true };

export async function loadStoryRuntimeContext(
  storyId: string,
  bootstrap: StoryRuntimeBootstrap,
): Promise<Story> {
  const context = createStoryContextAccumulator();
  const contextCount = Math.max(
    bootstrap.contextCounts.locations,
    bootstrap.contextCounts.characters,
    bootstrap.contextCounts.statDefinitions,
    bootstrap.contextCounts.statAssignments,
    bootstrap.contextCounts.itemDefinitions,
    bootstrap.contextCounts.itemInstances,
  );
  if (contextCount === 0) return createStoryLoadingProjection(bootstrap);
  let page = 1;
  while (true) {
    const result = await api.getStoryRuntimeContextPage(storyId, page);
    assertStoryProjectionPage(bootstrap.revision, page, result);
    appendStoryContextPage(context, result);
    const expectedHasMore = result.page * result.pageSize < contextCount;
    if (result.hasMore !== expectedHasMore) {
      throw new StoryProjectionIntegrityError(
        `runtime context page ${result.page} has inconsistent continuation metadata.`,
      );
    }
    if (!result.hasMore) break;
    page += 1;
  }
  for (const key of [
    'locations',
    'characters',
    'statDefinitions',
    'statAssignments',
    'itemDefinitions',
    'itemInstances',
  ] as const) {
    assertStoryProjectionIds(
      `${key} runtime context`,
      context[key].map(({ id }) => id),
      bootstrap.contextCounts[key],
    );
  }
  return projectStoryContext(createStoryLoadingProjection(bootstrap), context);
}

export async function loadStoryRuntimeSlice(
  story: Story,
  currentInteractionId: string | null,
  interactionIds: string[],
): Promise<Story> {
  const requestedInteractionIds = new Set(interactionIds);
  const storyInteractions = new Map(
    story.interactions.map((interaction) => [interaction.id, interaction]),
  );
  const interactions = new Map(
    story.interactions
      .filter(({ id }) => requestedInteractionIds.has(id))
      .map((interaction) => [interaction.id, { ...interaction, triggers: [] }]),
  );
  const missingInteractionIds = [...requestedInteractionIds].filter((id) => {
    const interaction = storyInteractions.get(id);
    return !interaction || isRuntimeReference(interaction);
  });
  const requestedInteractionChunks = chunk(missingInteractionIds, MAX_STORY_PAGE_SIZE);
  const firstRequestedChunk = requestedInteractionChunks.shift() ?? [];
  const optionInteractionIds = new Set<string>();
  let totalOptionCount: number | undefined;
  let page = 1;
  while (true) {
    const result = await api.getStoryRuntimeSlice(story.id, {
      currentInteractionId,
      interactionIds: page === 1 ? firstRequestedChunk : [],
      includeOptions: true,
      page,
      pageSize: STORY_EDITOR_PAGE_SIZE,
    });
    assertStoryProjectionPage(story.revision, page, result);
    if (totalOptionCount === undefined) totalOptionCount = result.totalOptionCount;
    if (result.totalOptionCount !== totalOptionCount) {
      throw new StoryProjectionIntegrityError(
        'runtime option pages disagree about their total count.',
      );
    }
    for (const optionInteractionId of result.optionInteractionIds) {
      if (optionInteractionIds.has(optionInteractionId)) {
        throw new StoryProjectionIntegrityError(
          'runtime option pages contain duplicate interaction identifiers.',
        );
      }
      optionInteractionIds.add(optionInteractionId);
    }
    mergeRuntimeSlice(interactions, result);
    const expectedHasMore = result.page * result.pageSize < totalOptionCount;
    if (result.hasMore !== expectedHasMore) {
      throw new StoryProjectionIntegrityError(
        `runtime option page ${result.page} has inconsistent continuation metadata.`,
      );
    }
    if (!result.hasMore) break;
    page += 1;
  }

  assertStoryProjectionIds('runtime options', [...optionInteractionIds], totalOptionCount ?? 0);
  if (
    [...optionInteractionIds].some((id) => {
      const interaction = interactions.get(id);
      return !interaction || isRuntimeReference(interaction);
    })
  ) {
    throw new StoryProjectionIntegrityError(
      'runtime options contain an interaction without its complete content.',
    );
  }

  for (const requestedIds of requestedInteractionChunks) {
    const result = await api.getStoryRuntimeSlice(story.id, {
      currentInteractionId,
      interactionIds: requestedIds,
      includeOptions: false,
      page: 1,
      pageSize: STORY_EDITOR_PAGE_SIZE,
    });
    assertStoryProjectionPage(story.revision, 1, result);
    mergeRuntimeSlice(interactions, result);
  }

  return { ...story, interactions: [...interactions.values()] };
}

function mergeRuntimeSlice(
  interactions: Map<string, Story['interactions'][number]>,
  result: StoryRuntimeSlice,
): void {
  for (const reference of result.interactionReferences) {
    if (!interactions.has(reference.id)) {
      const interactionReference: RuntimeInteractionProjection = {
        ...reference,
        body: '',
        position: { x: 0, y: 0 },
        triggers: [],
        [runtimeReference]: true,
      };
      interactions.set(reference.id, interactionReference);
    }
  }
  for (const interaction of result.interactions) interactions.set(interaction.id, interaction);
}

function isRuntimeReference(interaction: Interaction): boolean {
  return (interaction as RuntimeInteractionProjection)[runtimeReference] === true;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
