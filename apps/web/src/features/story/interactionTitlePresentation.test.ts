import { describe, expect, it } from 'vitest';
import type { Interaction } from '@paralleax/shared';
import { changeInterfaceLanguage, i18n } from '../../i18n';
import {
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
});
