import type { Interaction } from '@paralleax/shared';
import type { TFunction } from 'i18next';

export function interactionTitlePlaceholder(
  interaction: Pick<Interaction, 'triggers'>,
  t: TFunction,
): string {
  const hasInputlessTrigger = interaction.triggers.some(
    ({ inputInteractionIds }) => inputInteractionIds.length === 0,
  );
  return t(
    hasInputlessTrigger
      ? 'interactionInspector.startTitlePlaceholder'
      : 'interactionInspector.newTitlePlaceholder',
  );
}

export function interactionTitleForDisplay(interaction: Interaction, t: TFunction): string {
  return interaction.title.trim() || interactionTitlePlaceholder(interaction, t);
}
