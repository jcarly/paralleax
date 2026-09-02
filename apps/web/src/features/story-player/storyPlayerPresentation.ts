import type { TFunction } from 'i18next';
import type { Interaction, StatValue, Story, TriggerEvaluationContext } from '@paralleax/shared';
import {
  getTriggerConditionFailures,
  getTriggerConditionGroups,
  getTriggerConditions,
  getTriggerProbabilityFailures,
  getTriggerTimerFailures,
} from '@paralleax/shared';
import { describeTriggerCondition } from '../../triggerConditionPresentation';
import { getStatTargets, statTargetLabel } from '../../storyStats';

function getInteractionTitle(story: Story, interactionId: string) {
  return (
    story.interactions.find((interaction) => interaction.id === interactionId)?.title ??
    interactionId
  );
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
        (trigger.inputInteractionIds.length === 0 && getTriggerConditions(trigger).length > 0)
      : trigger.inputInteractionIds.length === 0,
  );
  const variants = triggers.flatMap((trigger) =>
    getTriggerConditionGroups(trigger).map(({ conditions }) =>
      conditions.length === 0
        ? t('player.condition.noConditions')
        : conditions
            .map((condition) => describeTriggerCondition(story, condition, t))
            .join(` ${t('player.condition.and')} `),
    ),
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
  evaluationContext?: TriggerEvaluationContext,
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
  if (failures.length === 0 && evaluationContext) {
    const probabilityFailures = getTriggerProbabilityFailures(
      interaction,
      currentId,
      visited,
      evaluationContext,
      currentLocationId,
      currentCharacterIds,
      statValues,
      currentDateTime,
      ownedItemDefinitionIds,
      itemStatValues,
    );
    if (probabilityFailures.length > 0) {
      return t('player.requirement.probabilityFailed', {
        probability: probabilityFailures[0].appearanceProbability,
        roll: probabilityFailures[0].roll.toFixed(2),
      });
    }
    const timerFailures = getTriggerTimerFailures(
      interaction,
      currentId,
      visited,
      evaluationContext,
      currentLocationId,
      currentCharacterIds,
      statValues,
      currentDateTime,
      ownedItemDefinitionIds,
      itemStatValues,
    );
    if (timerFailures.length > 0) {
      return t('player.requirement.timerExpired', {
        count: timerFailures[0].timerSeconds,
      });
    }
  }
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
