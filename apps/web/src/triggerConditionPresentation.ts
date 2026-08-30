import type { Story, TriggerCondition } from '@paralleax/shared';
import type { TFunction } from 'i18next';
import { getStatTargets, statTargetLabel } from './storyStats';

export function describeTriggerCondition(
  story: Story,
  condition: TriggerCondition,
  t: TFunction,
): string {
  if ('interactionId' in condition) {
    const title = story.interactions.find(({ id }) => id === condition.interactionId)?.title;
    return t(
      condition.hasBeenVisited ? 'player.condition.visited' : 'player.condition.notVisited',
      { title: title ?? condition.interactionId },
    );
  }
  if ('locationId' in condition) {
    const name = story.locations?.find(({ id }) => id === condition.locationId)?.name;
    return t(
      condition.isCurrentLocation
        ? 'player.condition.locationIs'
        : 'player.condition.locationIsNot',
      { name: name ?? condition.locationId },
    );
  }
  if ('characterId' in condition) {
    const name = story.characters?.find(({ id }) => id === condition.characterId)?.name;
    return t(condition.isPresent ? 'player.condition.present' : 'player.condition.absent', {
      name: name ?? condition.characterId,
    });
  }
  if ('itemDefinitionId' in condition) {
    const name = story.itemDefinitions?.find(({ id }) => id === condition.itemDefinitionId)?.name;
    return t(condition.isOwned ? 'player.condition.owns' : 'player.condition.doesNotOwn', {
      name: name ?? condition.itemDefinitionId,
    });
  }
  if ('statId' in condition) {
    const target = getStatTargets(story).find(
      (candidate) =>
        candidate.assignment.id === condition.statId && candidate.itemId === condition.itemId,
    );
    return t('player.condition.stat', {
      label: target ? statTargetLabel(target, t('attributes.owner.story')) : condition.statId,
      operator: t(`player.condition.operator.${condition.operator}`),
      value: condition.value,
    });
  }
  return t('player.condition.temporal');
}
