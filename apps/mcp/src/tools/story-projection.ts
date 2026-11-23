import type {
  ApiContextPage,
  ApiInteraction,
  ApiStory,
  ApiStoryList,
  ApiTrigger,
} from '../api-contract.js';

/** Compact, assistant-oriented views of API responses. No new domain rules. */

const EXCERPT_LENGTH = 240;

const entities: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Plain-text preview of rich text, for orientation only (never written back). */
export function textExcerpt(html: string, length = EXCERPT_LENGTH): string {
  const text = html
    .replace(/<(?:br|\/p|\/h[23]|\/li|\/blockquote)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function storySummaryView(story: ApiStoryList['items'][number]) {
  return {
    id: story.id,
    title: story.title,
    interactionCount: story.interactionCount,
    revision: story.revision,
    updatedAt: story.updatedAt,
    owner: story.owner?.displayName,
    visibility: story.access?.visibility,
    canEdit: story.capabilities?.canEdit ?? false,
  };
}

type Named = { id: string; name: string };

function namedList(items: readonly Named[]) {
  return items.map(({ id, name }) => ({ id, name }));
}

export function storyContextView(context: ApiContextPage, page: number) {
  return {
    locations: namedList(context.locations),
    characters: namedList(context.characters),
    statDefinitions: context.statDefinitions.map(
      ({ id, name, valueType, category, changePerHour }) => ({
        id,
        name,
        valueType,
        ...(category === undefined ? {} : { category }),
        ...(changePerHour === undefined ? {} : { changePerHour }),
      }),
    ),
    // The value an effect or condition targets is the assignment, not its definition.
    statAssignments: context.statAssignments.map(
      ({ id, statDefinitionId, ownerType, ownerId, initialValue }) => ({
        id,
        statDefinitionId,
        ownerType,
        ...(ownerId === undefined ? {} : { ownerId }),
        initialValue,
      }),
    ),
    itemDefinitions: namedList(context.itemDefinitions),
    page,
    hasMore: context.hasMore,
    truncated: context.hasMore,
  };
}

export function triggerView(trigger: ApiTrigger, outputInteractionId: string) {
  return {
    id: trigger.id,
    outputInteractionId,
    inputInteractionIds: trigger.inputInteractionIds,
    conditionGroups: trigger.conditionGroups,
    appearanceProbability: trigger.appearanceProbability,
    timerSeconds: trigger.timerSeconds,
  };
}

function interactionFields(interaction: ApiInteraction) {
  return {
    id: interaction.id,
    title: interaction.title,
    position: interaction.position,
    locationId: interaction.locationId,
    characterIds: interaction.characterIds,
    durationMinutes: interaction.durationMinutes,
    statEffects: interaction.statEffects,
    itemEffects: interaction.itemEffects,
  };
}

/** Triggers on other interactions that list this one as an input. */
function outgoingConnections(story: ApiStory, interactionId: string) {
  return story.interactions.flatMap((target) =>
    target.triggers
      .filter((trigger) => trigger.inputInteractionIds.includes(interactionId))
      .map((trigger) => ({
        triggerId: trigger.id,
        targetInteractionId: target.id,
        targetTitle: target.title,
      })),
  );
}

function referencedContext(story: ApiStory, interaction: ApiInteraction) {
  const location = story.locations.find(({ id }) => id === interaction.locationId);
  const characterIds = new Set(interaction.characterIds);
  return {
    location: location ? { id: location.id, name: location.name } : null,
    characters: namedList(story.characters.filter(({ id }) => characterIds.has(id))),
  };
}

export function interactionDetailView(story: ApiStory, interaction: ApiInteraction) {
  const titles = new Map(story.interactions.map(({ id, title }) => [id, title]));
  return {
    storyId: story.id,
    revision: story.revision,
    interaction: {
      ...interactionFields(interaction),
      body: interaction.body,
      conditionalTextBlocks: interaction.conditionalTextBlocks,
    },
    references: referencedContext(story, interaction),
    incomingTriggers: interaction.triggers.map((trigger) => ({
      ...triggerView(trigger, interaction.id),
      inputs: trigger.inputInteractionIds.map((id) => ({ id, title: titles.get(id) })),
    })),
    outgoingConnections: outgoingConnections(story, interaction.id),
  };
}
