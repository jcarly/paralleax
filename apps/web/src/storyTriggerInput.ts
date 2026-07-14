import type { TriggerCondition, Story } from '@paralleax/shared';

export type TriggerInputDeletionPlan =
  | {
      action: 'delete-trigger';
    }
  | {
      action: 'update-trigger';
      inputInteractionIds: string[];
      conditions: TriggerCondition[];
    };

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
  if (inputInteractionIds.length === 0) return { action: 'delete-trigger' };

  return {
    action: 'update-trigger',
    inputInteractionIds,
    conditions: trigger.conditions,
  };
}
