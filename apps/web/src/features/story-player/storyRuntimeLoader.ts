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
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
  StoryProjectionRevisionChangedError,
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
    assertRevision(bootstrap.revision, result.revision);
    appendStoryContextPage(context, result);
    if (!result.hasMore || result.page * result.pageSize >= contextCount) break;
    page += 1;
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
  let page = 1;
  while (true) {
    const result = await api.getStoryRuntimeSlice(story.id, {
      currentInteractionId,
      interactionIds: page === 1 ? firstRequestedChunk : [],
      includeOptions: true,
      page,
      pageSize: STORY_EDITOR_PAGE_SIZE,
    });
    assertRevision(story.revision, result.revision);
    mergeRuntimeSlice(interactions, result);
    if (!result.hasMore) break;
    page += 1;
  }

  for (const requestedIds of requestedInteractionChunks) {
    const result = await api.getStoryRuntimeSlice(story.id, {
      currentInteractionId,
      interactionIds: requestedIds,
      includeOptions: false,
      page: 1,
      pageSize: STORY_EDITOR_PAGE_SIZE,
    });
    assertRevision(story.revision, result.revision);
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

function assertRevision(expected: number | undefined, received: number): void {
  if ((expected ?? 1) !== received) throw new StoryProjectionRevisionChangedError();
}
