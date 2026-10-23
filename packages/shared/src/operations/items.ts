import type { Story } from '../model/index.js';
import { expressionReferencesAny } from '../expressions/index.js';
import {
  cleanStatConditionalTextReferences,
  removeStatConditionsReferencing,
} from '../stats/references.js';
import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  toCanonicalTrigger,
} from '../triggers/model.js';

export function deleteItemInstanceFromStory(story: Story, itemId: string): Story {
  const referencesDeletedItem = (expression?: string) =>
    expressionReferencesAny(expression, new Set(), new Set([itemId]));
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
        ({ itemId: affectedItemId, expression }) =>
          affectedItemId !== itemId && !referencesDeletedItem(expression),
      ),
      ...cleanStatConditionalTextReferences(interaction, new Set(), new Set([itemId])),
      triggers: interaction.triggers.map((trigger) => ({
        ...toCanonicalTrigger(trigger),
        conditionGroups: getTriggerConditionGroups(trigger).map((group) => ({
          ...group,
          conditions: removeStatConditionsReferencing(
            group.conditions,
            new Set(),
            new Set([itemId]),
          ),
        })),
        appearanceProbability: getTriggerAppearanceProbability(trigger),
        timerSeconds: getTriggerTimerSeconds(trigger),
      })),
    })),
  };
}
