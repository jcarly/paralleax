import type { Interaction, Story } from '../model/index.js';

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
        triggers: item.triggers.map((trigger) => {
          const inputInteractionIds = trigger.inputInteractionIds.filter(
            (id) => id !== interactionId,
          );
          return {
            ...trigger,
            inputInteractionIds,
            conditions: trigger.conditions.filter(
              (condition) =>
                !('interactionId' in condition) || condition.interactionId !== interactionId,
            ),
          };
        }),
      })),
  };
}
