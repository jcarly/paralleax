import type { Story, TriggerCondition } from '@paralleax/shared';
import type { TFunction } from 'i18next';
import { getStatTargets, statTargetValueType } from './storyStats';

export type ConditionType = 'interaction' | 'location' | 'character' | 'stat' | 'item' | 'dateTime';

export function createTriggerCondition(
  story: Story,
  currentInteractionId: string,
  type: ConditionType,
): TriggerCondition | undefined {
  switch (type) {
    case 'interaction': {
      const candidate = story.interactions.find((item) => item.id !== currentInteractionId);
      return candidate ? { interactionId: candidate.id, hasBeenVisited: true } : undefined;
    }
    case 'location': {
      const location = story.locations?.[0];
      return location ? { locationId: location.id, isCurrentLocation: true } : undefined;
    }
    case 'character': {
      const character = story.characters?.[0];
      return character ? { characterId: character.id, isPresent: true } : undefined;
    }
    case 'stat': {
      const target = getStatTargets(story)[0];
      return target
        ? {
            statId: target.assignment.id,
            ...(target.itemId ? { itemId: target.itemId } : {}),
            operator: statTargetValueType(target) === 'number' ? 'gte' : 'eq',
            value: target.assignment.initialValue,
          }
        : undefined;
    }
    case 'item': {
      const definition = story.itemDefinitions?.[0];
      return definition ? { itemDefinitionId: definition.id, isOwned: true } : undefined;
    }
    case 'dateTime':
      return { temporal: { weekdays: ['monday'] } };
  }
}

export function conditionUnavailableReasons(
  story: Story,
  currentInteractionId: string,
  t: TFunction,
): Record<ConditionType, string | undefined> {
  return {
    interaction: story.interactions.some(({ id }) => id !== currentInteractionId)
      ? undefined
      : t('triggerInspector.conditionUnavailable.interaction'),
    location:
      (story.locations?.length ?? 0) > 0
        ? undefined
        : t('triggerInspector.conditionUnavailable.location'),
    character:
      (story.characters?.length ?? 0) > 0
        ? undefined
        : t('triggerInspector.conditionUnavailable.character'),
    stat:
      getStatTargets(story).length > 0
        ? undefined
        : t('triggerInspector.conditionUnavailable.stat'),
    item:
      (story.itemDefinitions?.length ?? 0) > 0
        ? undefined
        : t('triggerInspector.conditionUnavailable.item'),
    dateTime: undefined,
  };
}
