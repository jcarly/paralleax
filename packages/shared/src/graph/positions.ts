import type { Position, Story } from '../model/index.js';

export interface StoryGraphInteractionPositionUpdate {
  interactionId: string;
  position: Position;
}

export interface StoryGraphTriggerPositionUpdate {
  interactionId: string;
  triggerIds: string[];
  position: Position;
}

export interface StoryGraphPositionUpdates {
  interactionUpdates: StoryGraphInteractionPositionUpdate[];
  triggerUpdates: StoryGraphTriggerPositionUpdate[];
}

export interface StoryGraphTriggerPositionPatch {
  interactionId: string;
  triggerIds: string[];
  position?: Position;
}

/**
 * A server-authored graph position response. Trigger positions are optional so
 * history can restore the absence of an explicitly-authored position.
 */
export interface StoryGraphPositionPatch {
  interactionUpdates: StoryGraphInteractionPositionUpdate[];
  triggerUpdates: StoryGraphTriggerPositionPatch[];
}

/** Applies one authored graph gesture without changing narrative relationships. */
export function updateStoryGraphPositions(story: Story, updates: StoryGraphPositionUpdates): Story {
  return applyStoryGraphPositionPatch(story, updates);
}

/** Applies a compact graph-position response while preserving untouched entity references. */
export function applyStoryGraphPositionPatch(story: Story, patch: StoryGraphPositionPatch): Story {
  const interactionPositions = new Map(
    patch.interactionUpdates.map(({ interactionId, position }) => [interactionId, position]),
  );
  const triggerPositions = new Map<string, Map<string, Position | undefined>>();
  for (const { interactionId, triggerIds, position } of patch.triggerUpdates) {
    const positions =
      triggerPositions.get(interactionId) ?? new Map<string, Position | undefined>();
    for (const triggerId of triggerIds) positions.set(triggerId, position);
    triggerPositions.set(interactionId, positions);
  }
  return {
    ...story,
    interactions: story.interactions.map((interaction) => {
      const position = interactionPositions.get(interaction.id);
      const interactionTriggerPositions = triggerPositions.get(interaction.id);
      const hasTriggerUpdate = interaction.triggers.some((trigger) =>
        interactionTriggerPositions?.has(trigger.id),
      );
      if (!position && !hasTriggerUpdate) return interaction;
      return {
        ...interaction,
        ...(position ? { position } : {}),
        ...(hasTriggerUpdate
          ? {
              triggers: interaction.triggers.map((trigger) => {
                if (!interactionTriggerPositions?.has(trigger.id)) return trigger;
                const triggerPosition = interactionTriggerPositions.get(trigger.id);
                if (triggerPosition) return { ...trigger, position: triggerPosition };
                const withoutPosition = { ...trigger };
                delete withoutPosition.position;
                return withoutPosition;
              }),
            }
          : {}),
      };
    }),
  };
}

/** Creates the minimal position patch needed to project `after` from `before`. */
export function diffStoryGraphPositions(before: Story, after: Story): StoryGraphPositionPatch {
  const afterInteractions = new Map(
    after.interactions.map((interaction) => [interaction.id, interaction]),
  );
  const interactionUpdates: StoryGraphInteractionPositionUpdate[] = [];
  const triggerUpdates: StoryGraphTriggerPositionPatch[] = [];

  for (const interaction of before.interactions) {
    const updatedInteraction = afterInteractions.get(interaction.id);
    if (!updatedInteraction) continue;
    if (!positionsEqual(interaction.position, updatedInteraction.position)) {
      interactionUpdates.push({
        interactionId: interaction.id,
        position: updatedInteraction.position,
      });
    }

    const updatedTriggers = new Map(
      updatedInteraction.triggers.map((trigger) => [trigger.id, trigger]),
    );
    for (const trigger of interaction.triggers) {
      const updatedTrigger = updatedTriggers.get(trigger.id);
      if (!updatedTrigger || positionsEqual(trigger.position, updatedTrigger.position)) continue;
      triggerUpdates.push({
        interactionId: interaction.id,
        triggerIds: [trigger.id],
        ...(updatedTrigger.position ? { position: updatedTrigger.position } : {}),
      });
    }
  }

  return { interactionUpdates, triggerUpdates };
}

function positionsEqual(left: Position | undefined, right: Position | undefined): boolean {
  return left === right || (left?.x === right?.x && left?.y === right?.y);
}
