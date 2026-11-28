import type { Interaction } from '@paralleax/shared';
import type { TFunction } from 'i18next';

/** The hint of an empty title field: generic, never a name that looks authored. */
export function interactionTitlePlaceholder(t: TFunction): string {
  return t('interactionInspector.titlePlaceholder');
}

const EXCERPT_LENGTH = 40;

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(text: string): string {
  if (text.length <= EXCERPT_LENGTH) {
    return text;
  }
  const cut = text.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > EXCERPT_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Compact, language-neutral name of an Interaction for lists, history, search
 * results and confirmations: its title, else the start of its content, else a short
 * reference taken from its ID. Computed for display only, never stored, and never
 * used in the Reader or in title fields.
 */
export function interactionLabelForDisplay(
  interaction: Pick<Interaction, 'id' | 'title' | 'body'>,
): string {
  const title = interaction.title.trim();
  if (title) {
    return title;
  }
  const content = plainText(interaction.body);
  return content ? excerpt(content) : `○ ${interaction.id.slice(-4)}`;
}

export interface ChoiceLabelPresentation {
  label: string;
  /** False when the label is a reader fallback rather than the authored title. */
  authored: boolean;
  /** Authoring only: several options follow and this one has no authored title. */
  needsLabel: boolean;
}

/**
 * A choice label is the destination Interaction's title. Without a title, a lone
 * choice reads as `Continue`, or `Start` on the start screen. One of several untitled choices reads as `Option N`
 * for readers only: authoring surfaces keep the label empty and show an error.
 */
export function choiceLabelForDisplay(
  destination: Pick<Interaction, 'title'>,
  position: { index: number; count: number; start?: boolean },
  t: TFunction,
  audience: 'reader' | 'author' = 'reader',
): ChoiceLabelPresentation {
  const title = destination.title.trim();
  if (title) {
    return { label: title, authored: true, needsLabel: false };
  }
  if (position.count <= 1) {
    return {
      label: t(position.start === true ? 'player.startChoice' : 'player.continueChoice'),
      authored: false,
      needsLabel: false,
    };
  }
  return {
    label: audience === 'reader' ? t('player.untitledChoice', { number: position.index + 1 }) : '',
    authored: false,
    needsLabel: audience === 'author',
  };
}

/**
 * The hint for an untitled Interaction's title field in Simulation, from how it was
 * reached: the generic placeholder for the starting point or after a lone option,
 * and an empty label flagged as an error after several options.
 */
export function simulationTitleHint(
  arrival: 'start' | { optionCount: number } | undefined,
  t: TFunction,
): { hint: string; needsLabel: boolean } {
  if (arrival === 'start') {
    return { hint: interactionTitlePlaceholder(t), needsLabel: false };
  }
  if (arrival === undefined) {
    return { hint: '', needsLabel: false };
  }
  return arrival.optionCount > 1
    ? { hint: '', needsLabel: true }
    : { hint: interactionTitlePlaceholder(t), needsLabel: false };
}
