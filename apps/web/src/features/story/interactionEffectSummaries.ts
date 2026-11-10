import type { TFunction } from 'i18next';
import { getItemDefinitionIdForInstance, type Interaction, type Story } from '@paralleax/shared';
import { getStatTargets, statTargetLabel } from '../../storyStats';

export function getInteractionEffectSummaries(
  story: Story,
  interaction: Interaction,
  t: TFunction,
) {
  const statTargets = getStatTargets(story);
  const stats = (interaction.statEffects ?? []).map((effect, index) =>
    summarizeStatEffect({ story, statTargets, effect, index, t }),
  );
  const items = (interaction.itemEffects ?? []).map((effect, index) =>
    summarizeItemEffect({ story, effect, index, t }),
  );
  return [...stats, ...items];
}

function summarizeStatEffect({
  story,
  statTargets,
  effect,
  index,
  t,
}: {
  story: Story;
  statTargets: ReturnType<typeof getStatTargets>;
  effect: NonNullable<Interaction['statEffects']>[number];
  index: number;
  t: TFunction;
}) {
  const target = statTargets.find(
    (candidate) => candidate.assignment.id === effect.statId && candidate.itemId === effect.itemId,
  );
  const targetName = target ? statTargetLabel(target, story.title) : effect.statId;
  const operation = t(
    effect.operation === 'add'
      ? 'interactionInspector.addOperation'
      : 'interactionInspector.setOperation',
  );
  return {
    id: `stat:${effect.itemId ?? ''}:${effect.statId}:${index}`,
    kind: 'stat' as const,
    label: t('interactionInspector.effectSummary.stat', {
      target: targetName,
      operation,
      value: effect.expression ?? String(effect.value ?? '?'),
    }),
  };
}

function summarizeItemEffect({
  story,
  effect,
  index,
  t,
}: {
  story: Story;
  effect: NonNullable<Interaction['itemEffects']>[number];
  index: number;
  t: TFunction;
}) {
  const characterName = findCharacterName(story, effect.characterId);
  const itemName = findItemName(story, effect);
  return {
    id: `item:${effect.characterId ?? ''}:${findItemIdentifier(story, effect) ?? index}:${index}`,
    kind: 'item' as const,
    label: t('interactionInspector.effectSummary.item', {
      character: characterName,
      operation: getItemOperationLabel(effect.operation, t),
      item: itemName,
    }),
  };
}

function findCharacterName(story: Story, characterId?: string) {
  const character = story.characters?.find(({ id }) => id === characterId);
  return character?.name ?? characterId ?? '?';
}

function findItemIdentifier(story: Story, effect: NonNullable<Interaction['itemEffects']>[number]) {
  if (effect.itemDefinitionId) {
    return effect.itemDefinitionId;
  }
  if (effect.itemId) {
    return getItemDefinitionIdForInstance(story, effect.itemId) ?? effect.itemId;
  }
  return undefined;
}

function findItemName(story: Story, effect: NonNullable<Interaction['itemEffects']>[number]) {
  const itemDefinitionId = findItemIdentifier(story, effect);
  const item = story.itemDefinitions?.find(({ id }) => id === itemDefinitionId);
  return item?.name ?? effect.itemId ?? '?';
}

function getItemOperationLabel(operation: 'obtain' | 'lose', t: TFunction) {
  const key =
    operation === 'obtain'
      ? 'interactionInspector.obtainOperation'
      : 'interactionInspector.loseOperation';
  return t(key);
}
