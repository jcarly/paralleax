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

export interface ChoiceLabelPresentation {
  label: string;
  /** False when the label is a reader fallback rather than the authored title. */
  authored: boolean;
  /** True when several options follow and this one has no authored title. */
  needsLabel: boolean;
}

/**
 * A choice label is the destination Interaction's title. Without a title, a lone
 * choice reads as `Continue` and one of several choices as `Option N`, so readers
 * never see an authoring placeholder such as `New interaction`.
 */
export function choiceLabelForDisplay(
  destination: Pick<Interaction, 'title'>,
  position: { index: number; count: number },
  t: TFunction,
): ChoiceLabelPresentation {
  const title = destination.title.trim();
  if (title) {
    return { label: title, authored: true, needsLabel: false };
  }
  if (position.count <= 1) {
    return { label: t('player.continueChoice'), authored: false, needsLabel: false };
  }
  return {
    label: t('player.untitledChoice', { number: position.index + 1 }),
    authored: false,
    needsLabel: true,
  };
}
