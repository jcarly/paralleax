import type { Interaction, Position, Story } from '../model/index.js';

export const childOffsetX = 0;
export const childOffsetY = 132;
export const childVerticalGap = 132;
export const minNodeVerticalDistance = 112;
export const sameColumnTolerance = 260;
export const rootColumnX = 80;
export const rootStartY = 120;

export function ensureStoryInteractionPositions(story: Story): Story {
  return {
    ...story,
    interactions: story.interactions.map((interaction, index) =>
      hasPosition(interaction)
        ? interaction
        : { ...interaction, position: getDefaultInteractionPosition(index) },
    ),
  };
}

export function getNextChildPosition(story: Story, parent: Interaction): Position {
  const parentPosition = getInteractionPosition(
    parent,
    story.interactions.findIndex((interaction) => interaction.id === parent.id),
  );
  const x = parentPosition.x + childOffsetX;
  const firstY = parentPosition.y + childOffsetY;
  const occupied = story.interactions.filter((item) => item.id !== parent.id);

  return findFreePosition(occupied, x, firstY);
}

export function getNextParentPosition(story: Story, target: Interaction): Position {
  const targetPosition = getInteractionPosition(
    target,
    story.interactions.findIndex((interaction) => interaction.id === target.id),
  );
  const x = targetPosition.x - childOffsetX;
  return findFreePositionAbove(story.interactions, x, targetPosition.y - childOffsetY);
}

export function getNextRootPosition(story: Story): Position {
  const roots = story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 0),
  );
  if (roots.length === 0) return { x: rootColumnX, y: rootStartY };

  const lowestRoot = roots.reduce((lowest, interaction) => {
    const interactionPosition = getInteractionPosition(
      interaction,
      story.interactions.findIndex((item) => item.id === interaction.id),
    );
    const lowestPosition = getInteractionPosition(
      lowest,
      story.interactions.findIndex((item) => item.id === lowest.id),
    );
    return interactionPosition.y > lowestPosition.y ? interaction : lowest;
  });
  const lowestRootPosition = getInteractionPosition(
    lowestRoot,
    story.interactions.findIndex((item) => item.id === lowestRoot.id),
  );

  return findFreePosition(
    story.interactions,
    lowestRootPosition.x,
    lowestRootPosition.y + childVerticalGap,
  );
}

function findFreePosition(occupied: Interaction[], x: number, firstY: number): Position {
  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY + index * childVerticalGap;
    const isFree = occupied.every((item, itemIndex) => {
      const position = getInteractionPosition(item, itemIndex);
      return (
        Math.abs(position.x - x) > sameColumnTolerance ||
        Math.abs(position.y - y) >= minNodeVerticalDistance
      );
    });
    if (isFree) return { x, y };
  }

  return { x, y: firstY + (occupied.length + 2) * childVerticalGap };
}

function findFreePositionAbove(occupied: Interaction[], x: number, firstY: number): Position {
  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY - index * childVerticalGap;
    const isFree = occupied.every((item, itemIndex) => {
      const position = getInteractionPosition(item, itemIndex);
      return (
        Math.abs(position.x - x) > sameColumnTolerance ||
        Math.abs(position.y - y) >= minNodeVerticalDistance
      );
    });
    if (isFree) return { x, y };
  }

  return { x, y: firstY - (occupied.length + 2) * childVerticalGap };
}

function getInteractionPosition(interaction: Interaction, index: number): Position {
  if (hasPosition(interaction)) return interaction.position;
  return getDefaultInteractionPosition(index);
}

function getDefaultInteractionPosition(index: number): Position {
  return {
    x: rootColumnX,
    y: rootStartY + Math.max(index, 0) * childVerticalGap,
  };
}

function hasPosition(interaction: Interaction): boolean {
  return (
    typeof interaction.position?.x === 'number' &&
    Number.isFinite(interaction.position.x) &&
    typeof interaction.position?.y === 'number' &&
    Number.isFinite(interaction.position.y)
  );
}
