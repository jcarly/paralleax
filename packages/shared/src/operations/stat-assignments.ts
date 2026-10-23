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

export function deleteStatAssignmentsFromStory(
  story: Story,
  assignmentIds: ReadonlySet<string>,
): Story {
  return {
    ...story,
    stats: (story.stats ?? []).filter(({ id }) => !assignmentIds.has(id)),
    characters: (story.characters ?? []).map((character) => ({
      ...character,
      stats: (character.stats ?? []).filter(({ id }) => !assignmentIds.has(id)),
    })),
    locations: (story.locations ?? []).map((location) => ({
      ...location,
      stats: (location.stats ?? []).filter(({ id }) => !assignmentIds.has(id)),
    })),
    itemDefinitions: (story.itemDefinitions ?? []).map((definition) => ({
      ...definition,
      stats: (definition.stats ?? []).filter(({ id }) => !assignmentIds.has(id)),
    })),
    interactions: story.interactions.map((interaction) => ({
      ...interaction,
      statEffects: (interaction.statEffects ?? []).filter(
        ({ statId, expression }) =>
          !assignmentIds.has(statId) && !expressionReferencesAny(expression, assignmentIds),
      ),
      ...cleanStatConditionalTextReferences(interaction, assignmentIds),
      triggers: interaction.triggers.map((trigger) => ({
        ...toCanonicalTrigger(trigger),
        conditionGroups: getTriggerConditionGroups(trigger).map((group) => ({
          ...group,
          conditions: removeStatConditionsReferencing(group.conditions, assignmentIds),
        })),
        appearanceProbability: getTriggerAppearanceProbability(trigger),
        timerSeconds: getTriggerTimerSeconds(trigger),
      })),
    })),
  };
}
