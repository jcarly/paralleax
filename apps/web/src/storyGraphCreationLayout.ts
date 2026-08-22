import {
  ensureStoryInteractionPositions,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  type Interaction,
  type Position,
  type Story,
  type Trigger,
} from '@paralleax/shared';
import { computeStoryGraphLayout, type StoryGraphLayoutOptions } from './storyGraphLayout';

export type StoryGraphClickCreation =
  { kind: 'root' } | { kind: 'child'; sourceId: string } | { kind: 'parent'; targetId: string };

const placeholderInteractionIdBase = '__paralleax_new_interaction__';
const placeholderTriggerIdBase = '__paralleax_new_trigger__';

export function getStoryGraphClickCreationPosition(
  story: Story,
  creation: StoryGraphClickCreation,
  options: StoryGraphLayoutOptions = {},
): Position | undefined {
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
  if (creation.kind === 'child' && !source) return undefined;
  if (creation.kind === 'parent' && !target) return undefined;

  const fallbackPosition = getFallbackPosition(positionedStory, creation, source, target);
  const placeholderTrigger: Trigger = {
    id: triggerId,
    inputInteractionIds: source ? [source.id] : [],
    conditions: [],
  };
  const placeholder: Interaction = {
    id: interactionId,
    title: 'New interaction',
    body: '',
    position: fallbackPosition,
    triggers: [placeholderTrigger],
  };
  const linkedParentTrigger: Trigger | undefined = target
    ? { id: triggerId, inputInteractionIds: [interactionId], conditions: [] }
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
  const layout = computeStoryGraphLayout(projectedStory, { kind: 'selection', targets }, options);

  return (
    layout.interactionUpdates.find((update) => update.interactionId === interactionId)?.position ??
    fallbackPosition
  );
}

function getFallbackPosition(
  story: Story,
  creation: StoryGraphClickCreation,
  source: Interaction | undefined,
  target: Interaction | undefined,
) {
  if (creation.kind === 'child' && source) return getNextChildPosition(story, source);
  if (creation.kind === 'parent' && target) return getNextParentPosition(story, target);
  return getNextRootPosition(story);
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
