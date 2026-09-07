import {
  doesTriggerInputMatch,
  getStatAssignmentOwners,
  getStoryItemEntries,
  getTriggerConditionGroups,
  getTriggerConditions,
  STORY_EDITOR_PAGE_SIZE,
  type Story,
  type StoryEditorBootstrap,
  type StoryEditorContextPage,
  type StoryEditorInteractionContentPage,
  type StoryEditorInteractionPage,
  type StoryEditorTriggerContentPage,
  type StoryEditorTriggerPage,
  type StoryRuntimeSlice,
  type StoryRuntimeSliceRequest,
} from '@paralleax/shared';

export function storyProjectionBootstrap(
  story: Story,
  includeGraphDecorations = true,
): StoryEditorBootstrap {
  const statAssignmentCount = getStatAssignmentOwners(story).reduce(
    (count, owner) => count + owner.assignments.length,
    0,
  );
  return {
    id: story.id,
    revision: story.revision ?? 1,
    title: story.title,
    startDateTime: story.startDateTime,
    access: story.access,
    capabilities: story.capabilities,
    owner: story.owner,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    contextCounts: {
      locations: story.locations?.length ?? 0,
      characters: story.characters?.length ?? 0,
      statDefinitions: story.statDefinitions?.length ?? 0,
      statAssignments: statAssignmentCount,
      itemDefinitions: story.itemDefinitions?.length ?? 0,
      itemInstances: getStoryItemEntries(story).length,
      graphDecorations: includeGraphDecorations ? (story.graphDecorations?.length ?? 0) : 0,
    },
    interactionCount: story.interactions.length,
    triggerCount: story.interactions.reduce(
      (count, interaction) => count + interaction.triggers.length,
      0,
    ),
  };
}

export function storyProjectionContextPage(
  story: Story,
  page = 1,
  pageSize = STORY_EDITOR_PAGE_SIZE,
  includeGraphDecorations = true,
): StoryEditorContextPage {
  const statAssignments = getStatAssignmentOwners(story).flatMap((owner) =>
    owner.assignments.map((assignment) => ({
      ...assignment,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
    })),
  );
  const itemInstances = getStoryItemEntries(story).map(({ ownerType, ownerId, item }) => ({
    ...item,
    ownerType,
    ownerId,
  }));
  const graphDecorations = includeGraphDecorations ? (story.graphDecorations ?? []) : [];
  const collections = [
    story.locations ?? [],
    story.characters ?? [],
    story.statDefinitions ?? [],
    statAssignments,
    story.itemDefinitions ?? [],
    itemInstances,
    graphDecorations,
  ];
  return {
    ...pageMetadata(
      story,
      page,
      pageSize,
      collections.some((items) => hasMore(items, page, pageSize)),
    ),
    locations: pageItems(story.locations ?? [], page, pageSize).map(
      ({ stats: _stats, items: _items, ...location }) => location,
    ),
    characters: pageItems(story.characters ?? [], page, pageSize).map(
      ({ stats: _stats, items: _items, ...character }) => character,
    ),
    statDefinitions: pageItems(story.statDefinitions ?? [], page, pageSize),
    statAssignments: pageItems(statAssignments, page, pageSize),
    itemDefinitions: pageItems(story.itemDefinitions ?? [], page, pageSize).map(
      ({ stats: _stats, ...definition }) => definition,
    ),
    itemInstances: pageItems(itemInstances, page, pageSize),
    graphDecorations: pageItems(graphDecorations, page, pageSize),
  };
}

export function storyProjectionInteractionPage(
  story: Story,
  page = 1,
  pageSize = STORY_EDITOR_PAGE_SIZE,
): StoryEditorInteractionPage {
  return {
    ...pageMetadata(story, page, pageSize, hasMore(story.interactions, page, pageSize)),
    interactions: pageItems(story.interactions, page, pageSize).map(
      ({ id, title, position, locationId }) => ({ id, title, position, locationId }),
    ),
  };
}

export function storyProjectionTriggerPage(
  story: Story,
  page = 1,
  pageSize = STORY_EDITOR_PAGE_SIZE,
): StoryEditorTriggerPage {
  const triggers = story.interactions.flatMap((interaction) =>
    interaction.triggers.map(({ id, inputInteractionIds, position }) => ({
      id,
      inputInteractionIds,
      position,
      outputInteractionId: interaction.id,
    })),
  );
  return {
    ...pageMetadata(story, page, pageSize, hasMore(triggers, page, pageSize)),
    triggers: pageItems(triggers, page, pageSize),
  };
}

export function storyProjectionInteractionContentPage(
  story: Story,
  page = 1,
  pageSize = STORY_EDITOR_PAGE_SIZE,
): StoryEditorInteractionContentPage {
  return {
    ...pageMetadata(story, page, pageSize, hasMore(story.interactions, page, pageSize)),
    interactions: pageItems(story.interactions, page, pageSize).map(
      ({
        id,
        body,
        durationMinutes,
        characterIds,
        statEffects,
        itemEffects,
        conditionalTextBlocks,
      }) => ({
        interactionId: id,
        body,
        durationMinutes,
        characterIds,
        statEffects,
        itemEffects,
        conditionalTextBlocks,
      }),
    ),
  };
}

export function storyProjectionTriggerContentPage(
  story: Story,
  page = 1,
  pageSize = STORY_EDITOR_PAGE_SIZE,
): StoryEditorTriggerContentPage {
  const triggers = story.interactions.flatMap((interaction) => interaction.triggers);
  return {
    ...pageMetadata(story, page, pageSize, hasMore(triggers, page, pageSize)),
    triggers: pageItems(triggers, page, pageSize).map((trigger) => ({
      triggerId: trigger.id,
      conditionGroups: getTriggerConditionGroups(trigger),
      appearanceProbability: trigger.appearanceProbability,
      timerSeconds: trigger.timerSeconds,
    })),
  };
}

export function storyProjectionRuntimeSlice(
  story: Story,
  request: Partial<StoryRuntimeSliceRequest> = {},
): StoryRuntimeSlice {
  const candidates =
    request.includeOptions === false
      ? []
      : story.interactions.filter((interaction) =>
          interaction.triggers.some((trigger) =>
            doesTriggerInputMatch(trigger, request.currentInteractionId ?? null),
          ),
        );
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? STORY_EDITOR_PAGE_SIZE;
  const options = pageItems(candidates, page, pageSize);
  const optionIds = new Set(options.map(({ id }) => id));
  const requestedIds = new Set(request.interactionIds ?? []);
  const referencedIds = new Set(
    options.flatMap((interaction) =>
      interaction.triggers.flatMap((trigger) =>
        getTriggerConditions(trigger).flatMap((condition) =>
          'interactionId' in condition ? [condition.interactionId] : [],
        ),
      ),
    ),
  );
  return {
    revision: story.revision ?? 1,
    page,
    pageSize,
    totalOptionCount: candidates.length,
    hasMore: hasMore(candidates, page, pageSize),
    optionInteractionIds: [...optionIds],
    interactionReferences: story.interactions
      .filter(({ id }) => referencedIds.has(id))
      .map(({ id, title }) => ({ id, title })),
    interactions: story.interactions
      .filter(({ id }) => optionIds.has(id) || requestedIds.has(id))
      .map((interaction) => ({
        ...structuredClone(interaction),
        triggers: optionIds.has(interaction.id)
          ? interaction.triggers.filter((trigger) =>
              doesTriggerInputMatch(trigger, request.currentInteractionId ?? null),
            )
          : [],
      })),
  };
}

function pageMetadata(story: Story, page: number, pageSize: number, more: boolean) {
  return { revision: story.revision ?? 1, page, pageSize, hasMore: more };
}

function pageItems<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const offset = (page - 1) * pageSize;
  return items.slice(offset, offset + pageSize);
}

function hasMore(items: readonly unknown[], page: number, pageSize: number): boolean {
  return page * pageSize < items.length;
}
