import type { Interaction, Story } from '@paralleax/shared';
import type { SelectedTrigger } from './storyGraph';

export function findInteraction(
  story: Story | undefined,
  interactionId: string | undefined,
): Interaction | undefined {
  if (!story || !interactionId) return undefined;
  return story.interactions.find((item) => item.id === interactionId);
}

export function findSelectedTrigger(
  story: Story | undefined,
  selectedTrigger: SelectedTrigger | undefined,
):
  | {
      interaction: Interaction;
      trigger: Interaction['triggers'][number];
    }
  | undefined {
  const interaction = findInteraction(story, selectedTrigger?.interactionId);
  const trigger = interaction?.triggers.find((item) => item.id === selectedTrigger?.triggerId);
  if (!interaction || !trigger) return undefined;
  return { interaction, trigger };
}

export function findRootTrigger(
  interaction: Interaction | undefined,
): Interaction['triggers'][number] | undefined {
  return interaction?.triggers.find((trigger) => trigger.inputInteractionIds.length === 0);
}
