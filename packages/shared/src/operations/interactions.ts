import type { Interaction, Story } from '../model/index.js';
import { getTriggerConditionGroups, toCanonicalTrigger } from '../triggers/model.js';

export function updateInteractionInStory(
  story: Story,
  interactionId: string,
  patch: Partial<Interaction>,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId ? { ...item, ...patch } : item,
    ),
  };
}

export function deleteInteractionFromStory(story: Story, interactionId: string): Story {
  return {
    ...story,
    interactions: story.interactions
      .filter((item) => item.id !== interactionId)
      .map((item) => ({
        ...item,
        conditionalTextBlocks: (item.conditionalTextBlocks ?? []).map((block) => ({
          ...block,
          conditions: block.conditions.filter(
            (condition) =>
              !('interactionId' in condition) || condition.interactionId !== interactionId,
          ),
        })),
        triggers: item.triggers.map((trigger) => {
          const inputInteractionIds = trigger.inputInteractionIds.filter(
            (id) => id !== interactionId,
          );
          const canonicalTrigger = toCanonicalTrigger(trigger);
          return {
            ...canonicalTrigger,
            inputInteractionIds,
            conditionGroups: getTriggerConditionGroups(trigger).map((group) => ({
              ...group,
              conditions: group.conditions.filter(
                (condition) =>
                  !('interactionId' in condition) || condition.interactionId !== interactionId,
              ),
            })),
          };
        }),
      })),
  };
}
