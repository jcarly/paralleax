import type { TriggerCondition, Story } from '@paralleax/shared';

export interface TriggerInputDeletionPlan {
  inputInteractionIds: string[];
  conditions: TriggerCondition[];
}

export function planTriggerInputDeletion(
  story: Story | undefined,
  interactionId: string,
  triggerId: string,
  inputInteractionId: string,
): TriggerInputDeletionPlan | undefined {
  const interaction = story?.interactions.find((item) => item.id === interactionId);
  const trigger = interaction?.triggers.find((item) => item.id === triggerId);
  if (!trigger) return undefined;

  const inputInteractionIds = trigger.inputInteractionIds.filter((id) => id !== inputInteractionId);
  return {
    inputInteractionIds,
    conditions: trigger.conditions,
  };
}
