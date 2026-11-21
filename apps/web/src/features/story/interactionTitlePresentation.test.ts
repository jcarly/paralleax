import { describe, expect, it } from 'vitest';
import type { Interaction } from '@paralleax/shared';
import { changeInterfaceLanguage, i18n } from '../../i18n';
import {
  choiceLabelForDisplay,
  interactionTitleForDisplay,
  interactionTitlePlaceholder,
} from './interactionTitlePresentation';

function interaction(title: string, inputInteractionIds: string[]): Interaction {
  return {
    id: 'interaction-1',
    title,
    body: '',
    position: { x: 0, y: 0 },
    triggers: [{ id: 'trigger-1', inputInteractionIds }],
  };
}

describe('interaction title presentation', () => {
  it('shows localized placeholders without rewriting authored titles', async () => {
    await changeInterfaceLanguage('fr');
    expect(interactionTitleForDisplay(interaction('', []), i18n.t.bind(i18n))).toBe('Départ');
    expect(interactionTitleForDisplay(interaction('', ['source']), i18n.t.bind(i18n))).toBe(
      'Nouvelle interaction',
    );
    expect(interactionTitleForDisplay(interaction('Start', []), i18n.t.bind(i18n))).toBe('Start');
  });

  it('uses the default interaction placeholder for linked interactions', async () => {
    await i18n.changeLanguage('en');
    expect(interactionTitlePlaceholder(interaction('', ['source']), i18n.t.bind(i18n))).toBe(
      'New interaction',
    );
  });

  it('labels untitled choices for readers', async () => {
    await i18n.changeLanguage('en');
    const t = i18n.t.bind(i18n);

    expect(choiceLabelForDisplay({ title: '' }, { index: 0, count: 1 }, t)).toEqual({
      label: 'Continue',
      authored: false,
      needsLabel: false,
    });
    expect(choiceLabelForDisplay({ title: ' ' }, { index: 1, count: 3 }, t)).toEqual({
      label: 'Option 2',
      authored: false,
      needsLabel: false,
    });
    expect(choiceLabelForDisplay({ title: 'Leave' }, { index: 0, count: 3 }, t)).toEqual({
      label: 'Leave',
      authored: true,
      needsLabel: false,
    });
    expect(choiceLabelForDisplay({ title: ' ' }, { index: 1, count: 3 }, t, 'author')).toEqual({
      label: '',
      authored: false,
      needsLabel: true,
    });
    expect(choiceLabelForDisplay({ title: '' }, { index: 0, count: 1 }, t, 'author').label).toBe(
      'Continue',
    );
    await changeInterfaceLanguage('fr');
    expect(
      choiceLabelForDisplay({ title: '' }, { index: 0, count: 1 }, i18n.t.bind(i18n)).label,
    ).toBe('Continuer');
    await i18n.changeLanguage('en');
  });
});
