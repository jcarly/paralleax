import type { Interaction, Story } from '@paralleax/shared';

/** The Interactions that lead to `interaction`, in Story order. */
export function getInteractionSources(
  story: Pick<Story, 'interactions'>,
  interaction: Pick<Interaction, 'triggers'>,
): { isStart: boolean; sources: Interaction[] } {
  const sourceIds = new Set(
    interaction.triggers.flatMap(({ inputInteractionIds }) => inputInteractionIds),
  );
  return {
    isStart: interaction.triggers.some(
      ({ inputInteractionIds }) => inputInteractionIds.length === 0,
    ),
    sources: story.interactions.filter(({ id }) => sourceIds.has(id)),
  };
}
