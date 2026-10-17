import type { Story } from '../model/index.js';
import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  toCanonicalTrigger,
} from '../triggers/model.js';

export function deleteItemInstanceFromStory(story: Story, itemId: string): Story {
  return {
    ...story,
    characters: (story.characters ?? []).map((character) => ({
      ...character,
      items: (character.items ?? []).filter(({ id }) => id !== itemId),
    })),
    locations: (story.locations ?? []).map((location) => ({
      ...location,
      items: (location.items ?? []).filter(({ id }) => id !== itemId),
    })),
    interactions: story.interactions.map((interaction) => ({
      ...interaction,
      itemEffects: (interaction.itemEffects ?? []).filter(
        ({ itemId: affectedItemId }) => affectedItemId !== itemId,
      ),
      statEffects: (interaction.statEffects ?? []).filter(
        ({ itemId: affectedItemId }) => affectedItemId !== itemId,
      ),
      triggers: interaction.triggers.map((trigger) => ({
        ...toCanonicalTrigger(trigger),
        conditionGroups: getTriggerConditionGroups(trigger).map((group) => ({
          ...group,
          conditions: group.conditions.filter(
            (condition) =>
              !('statId' in condition) ||
              (condition.itemId !== itemId &&
                !('comparisonItemId' in condition && condition.comparisonItemId === itemId)),
          ),
        })),
        appearanceProbability: getTriggerAppearanceProbability(trigger),
        timerSeconds: getTriggerTimerSeconds(trigger),
      })),
    })),
  };
}
