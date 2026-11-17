import {
  ensureStoryInteractionPositions,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  type Position,
  type Story,
} from '@paralleax/shared';

export type StoryGraphClickCreation =
  { kind: 'root' } | { kind: 'child'; sourceId: string } | { kind: 'parent'; targetId: string };

export function getStoryGraphFallbackCreationPosition(
  story: Story,
  creation: StoryGraphClickCreation,
): Position | undefined {
  return getPositionedStoryGraphFallbackPosition(ensureStoryInteractionPositions(story), creation);
}

export function getPositionedStoryGraphFallbackPosition(
  story: Story,
  creation: StoryGraphClickCreation,
): Position | undefined {
  switch (creation.kind) {
    case 'child': {
      const source = story.interactions.find(({ id }) => id === creation.sourceId);
      if (!source) {
        return undefined;
      }
      return getNextChildPosition(story, source);
    }
    case 'parent': {
      const target = story.interactions.find(({ id }) => id === creation.targetId);
      if (!target) {
        return undefined;
      }
      return getNextParentPosition(story, target);
    }
    case 'root':
      return getNextRootPosition(story);
  }
}
