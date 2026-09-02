import type { Story, TriggerPatch } from '../model/index.js';
import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  toCanonicalTrigger,
} from '../triggers/model.js';

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
                ? (() => {
                    const canonicalTrigger = toCanonicalTrigger(trigger);
                    return {
                      ...canonicalTrigger,
                      conditionGroups: getTriggerConditionGroups(trigger),
                      appearanceProbability: getTriggerAppearanceProbability(trigger),
                      ...(patch.inputInteractionIds === undefined
                        ? {}
                        : {
                            inputInteractionIds: normalizeTriggerInputIds(
                              patch.inputInteractionIds,
                            ),
                          }),
                      ...(patch.conditionGroups === undefined
                        ? patch.conditions === undefined
                          ? {}
                          : {
                              conditionGroups: [
                                {
                                  id: trigger.conditionGroups?.[0]?.id ?? trigger.id,
                                  conditions: patch.conditions,
                                },
                              ],
                            }
                        : { conditionGroups: patch.conditionGroups }),
                      ...(patch.appearanceProbability === undefined
                        ? {}
                        : { appearanceProbability: patch.appearanceProbability }),
                      ...(patch.timerSeconds === undefined
                        ? {}
                        : { timerSeconds: patch.timerSeconds }),
                      ...(patch.position === undefined ? {} : { position: patch.position }),
                    };
                  })()
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
                    trigger.id === triggerId
                      ? { ...toCanonicalTrigger(trigger), inputInteractionIds: [] }
                      : trigger,
                  )
                : item.triggers.filter((trigger) => trigger.id !== triggerId),
          }
        : item,
    ),
  };
}
