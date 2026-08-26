import type { TFunction } from 'i18next';
import type { Interaction, StatValue, Story, TriggerCondition } from '@paralleax/shared';
import { getTriggerConditionFailures } from '@paralleax/shared';
import { getStatTargets, statTargetLabel } from '../../storyStats';

function getInteractionTitle(story: Story, interactionId: string) {
  return (
    story.interactions.find((interaction) => interaction.id === interactionId)?.title ??
    interactionId
  );
}

function describeCondition(story: Story, condition: TriggerCondition, t: TFunction) {
  if ('locationId' in condition) {
    const name =
      story.locations?.find((location) => location.id === condition.locationId)?.name ??
      condition.locationId;
    return t(
      condition.isCurrentLocation
        ? 'player.condition.locationIs'
        : 'player.condition.locationIsNot',
      { name },
    );
  }
  if ('interactionId' in condition) {
    const title = getInteractionTitle(story, condition.interactionId);
    return t(
      condition.hasBeenVisited ? 'player.condition.visited' : 'player.condition.notVisited',
      { title },
    );
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
  if ('itemDefinitionId' in condition) {
    const name =
      story.itemDefinitions?.find(({ id }) => id === condition.itemDefinitionId)?.name ??
      condition.itemDefinitionId;
    return t(condition.isOwned ? 'player.condition.owns' : 'player.condition.doesNotOwn', {
      name,
    });
  }
  if ('temporal' in condition) return t('player.condition.temporal');
  const name =
    story.characters?.find((character) => character.id === condition.characterId)?.name ??
    condition.characterId;
  return t(condition.isPresent ? 'player.condition.present' : 'player.condition.absent', {
    name,
  });
}

export function getConditionSummary(
  story: Story,
  interaction: Interaction,
  currentId: string | null,
  t: TFunction,
) {
  const triggers = interaction.triggers.filter((trigger) =>
    currentId
      ? trigger.inputInteractionIds.includes(currentId) ||
        (trigger.inputInteractionIds.length === 0 && trigger.conditions.length > 0)
      : trigger.inputInteractionIds.length === 0,
  );
  const variants = triggers.map((trigger) =>
    trigger.conditions.length === 0
      ? t('player.condition.noConditions')
      : trigger.conditions
          .map((condition) => describeCondition(story, condition, t))
          .join(` ${t('player.condition.and')} `),
  );
  return variants.length > 1
    ? variants.join(` ${t('player.condition.or')} `)
    : (variants[0] ?? t('player.condition.noMatching'));
}

export function getUnavailableReason(
  story: Story,
  interaction: Interaction,
  currentId: string | null,
  visited: string[],
  currentLocationId: string | null,
  currentCharacterIds: string[],
  statValues: Readonly<Record<string, StatValue>>,
  currentDateTime: string,
  ownedItemDefinitionIds: readonly string[],
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
  t: TFunction,
) {
  const failures = getTriggerConditionFailures(
    interaction,
    currentId,
    visited,
    currentLocationId,
    currentCharacterIds,
    statValues,
    currentDateTime,
    ownedItemDefinitionIds,
    itemStatValues,
  );
  if (failures.length === 0) return undefined;

  const firstFailure = failures[0].condition;
  if ('locationId' in firstFailure) {
    const name =
      story.locations?.find((location) => location.id === firstFailure.locationId)?.name ??
      firstFailure.locationId;
    return t(
      firstFailure.isCurrentLocation
        ? 'player.requirement.locationIs'
        : 'player.requirement.locationIsNot',
      { name },
    );
  }
  if ('interactionId' in firstFailure) {
    const title = getInteractionTitle(story, firstFailure.interactionId);
    return t(
      firstFailure.hasBeenVisited ? 'player.requirement.visited' : 'player.requirement.notVisited',
      { title },
    );
  }
  if ('statId' in firstFailure) {
    const target = getStatTargets(story).find(
      (candidate) =>
        candidate.assignment.id === firstFailure.statId && candidate.itemId === firstFailure.itemId,
    );
    return t('player.requirement.stat', {
      label: target ? statTargetLabel(target, t('attributes.owner.story')) : firstFailure.statId,
      operator: t(`player.requirement.operator.${firstFailure.operator}`),
      value: firstFailure.value,
    });
  }
  if ('itemDefinitionId' in firstFailure) {
    const name =
      story.itemDefinitions?.find(({ id }) => id === firstFailure.itemDefinitionId)?.name ??
      firstFailure.itemDefinitionId;
    return t(firstFailure.isOwned ? 'player.requirement.owns' : 'player.requirement.doesNotOwn', {
      name,
    });
  }
  if ('temporal' in firstFailure) {
    return t('player.requirement.temporal', { time: currentDateTime.replace('T', ' ') });
  }
  const name =
    story.characters?.find((character) => character.id === firstFailure.characterId)?.name ??
    firstFailure.characterId;
  return t(firstFailure.isPresent ? 'player.requirement.present' : 'player.requirement.absent', {
    name,
  });
}
