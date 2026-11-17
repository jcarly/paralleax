import {
  ensureStoryInteractionPositions,
  type Interaction,
  type Position,
  type Story,
  type Trigger,
} from '@paralleax/shared';
import {
  getPositionedStoryGraphFallbackPosition,
  type StoryGraphClickCreation,
} from './storyGraphCreationFallback';
import type { StoryGraphLayoutOptions } from './storyGraphLayout';

export type { StoryGraphClickCreation } from './storyGraphCreationFallback';

const placeholderInteractionIdBase = '__paralleax_new_interaction__';
const placeholderTriggerIdBase = '__paralleax_new_trigger__';

export async function getStoryGraphClickCreationPosition(
  story: Story,
  creation: StoryGraphClickCreation,
  options: StoryGraphLayoutOptions = {},
): Promise<Position | undefined> {
  const positionedStory = ensureStoryInteractionPositions(story);
  const interactionId = getUnusedId(
    placeholderInteractionIdBase,
    new Set(positionedStory.interactions.map(({ id }) => id)),
  );
  const triggerIds = new Set(
    positionedStory.interactions.flatMap((interaction) => interaction.triggers.map(({ id }) => id)),
  );
  const triggerId = getUnusedId(placeholderTriggerIdBase, triggerIds);
  const source =
    creation.kind === 'child'
      ? positionedStory.interactions.find(({ id }) => id === creation.sourceId)
      : undefined;
  const target =
    creation.kind === 'parent'
      ? positionedStory.interactions.find(({ id }) => id === creation.targetId)
      : undefined;
  if (creation.kind === 'child' && !source) {
    return undefined;
  }
  if (creation.kind === 'parent' && !target) {
    return undefined;
  }

  const fallbackPosition = getPositionedStoryGraphFallbackPosition(positionedStory, creation);
  if (!fallbackPosition) {
    return undefined;
  }
  const placeholderTrigger: Trigger = {
    id: triggerId,
    inputInteractionIds: source ? [source.id] : [],
    conditionGroups: [{ id: triggerId, conditions: [] }],
    appearanceProbability: 100,
    timerSeconds: null,
  };
  const placeholder: Interaction = {
    id: interactionId,
    title: 'New interaction',
    body: '',
    position: fallbackPosition,
    triggers: [placeholderTrigger],
  };
  const linkedParentTrigger: Trigger | undefined = target
    ? {
        id: triggerId,
        inputInteractionIds: [interactionId],
        conditionGroups: [{ id: triggerId, conditions: [] }],
        appearanceProbability: 100,
        timerSeconds: null,
      }
    : undefined;
  const projectedStory: Story = {
    ...positionedStory,
    interactions: [
      ...positionedStory.interactions.map((interaction) =>
        interaction.id === target?.id && linkedParentTrigger
          ? { ...interaction, triggers: [...interaction.triggers, linkedParentTrigger] }
          : interaction,
      ),
      placeholder,
    ],
  };
  const targets = [
    { type: 'interaction' as const, interactionId },
    ...(source
      ? [{ type: 'trigger' as const, interactionId, triggerId }]
      : target
        ? [{ type: 'trigger' as const, interactionId: target.id, triggerId }]
        : []),
  ];
  try {
    const { computeStoryGraphElkLayout } = await import('./storyGraphElkLayout');
    const layout = await computeStoryGraphElkLayout(projectedStory, {
      ...options,
      scope: { kind: 'selection', targets },
    });

    return (
      layout.interactionUpdates.find((update) => update.interactionId === interactionId)
        ?.position ?? fallbackPosition
    );
  } catch {
    return fallbackPosition;
  }
}

function getUnusedId(base: string, usedIds: ReadonlySet<string>) {
  let id = base;
  let suffix = 1;
  while (usedIds.has(id)) {
    id = `${base}${suffix}`;
    suffix += 1;
  }
  return id;
}
