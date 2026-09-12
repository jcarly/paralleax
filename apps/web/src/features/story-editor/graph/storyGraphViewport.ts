import type { Story } from '@paralleax/shared';
import type { FitViewOptions } from '@xyflow/react';
import type { StoryFlowNode } from '../../../storyGraph';

const fullGraphFitInteractionLimit = 250;
const initialEntryInteractionLimit = 8;

export function getInitialStoryFitViewOptions(
  story: Story | undefined,
): FitViewOptions<StoryFlowNode> {
  if (!story) return { padding: 0.18, maxZoom: 1 };
  if (story.interactions.length <= fullGraphFitInteractionLimit) {
    return { padding: 0.18, maxZoom: 1 };
  }

  const entryInteractions = story.interactions.filter((interaction) =>
    interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 0),
  );
  const initialInteractions = (
    entryInteractions.length > 0 ? entryInteractions : story.interactions.slice(0, 1)
  ).slice(0, initialEntryInteractionLimit);

  return {
    padding: 0.7,
    maxZoom: 1,
    nodes: initialInteractions.map(({ id }) => ({ id })),
  };
}
