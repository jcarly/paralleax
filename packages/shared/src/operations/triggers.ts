import type { Story, TriggerPatch } from '../model/index.js';

export function normalizeTriggerInputIds(inputInteractionIds: string[]): string[] {
  return [...new Set(inputInteractionIds)];
}

export function updateTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
  patch: TriggerPatch,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
            ...item,
            triggers: item.triggers.map((trigger) =>
              trigger.id === triggerId
                ? {
                    ...trigger,
                    ...(patch.inputInteractionIds === undefined
                      ? {}
                      : {
                          inputInteractionIds: normalizeTriggerInputIds(patch.inputInteractionIds),
                        }),
                    ...(patch.conditions === undefined ? {} : { conditions: patch.conditions }),
                    ...(patch.position === undefined ? {} : { position: patch.position }),
                  }
                : trigger,
            ),
          }
        : item,
    ),
  };
}

export function deleteTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
            ...item,
            triggers:
              item.triggers.length <= 1
                ? item.triggers.map((trigger) =>
                    trigger.id === triggerId ? { ...trigger, inputInteractionIds: [] } : trigger,
                  )
                : item.triggers.filter((trigger) => trigger.id !== triggerId),
          }
        : item,
    ),
  };
}
