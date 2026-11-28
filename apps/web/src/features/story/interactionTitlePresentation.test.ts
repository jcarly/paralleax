import { describe, expect, it } from 'vitest';
import type { Interaction } from '@paralleax/shared';
import { changeInterfaceLanguage, i18n } from '../../i18n';
import {
  choiceLabelForDisplay,
  interactionLabelForDisplay,
  interactionTitlePlaceholder,
  simulationTitleHint,
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

function withContent(title: string, body: string, id = 'interaction-1'): Interaction {
  return { ...interaction(title, []), id, body };
}

describe('interaction title presentation', () => {
  it('uses one generic, localized hint for empty title fields', async () => {
    const t = i18n.t.bind(i18n);
    await i18n.changeLanguage('en');
    expect(interactionTitlePlaceholder(t)).toBe('Title (optional)');
    await changeInterfaceLanguage('fr');
    expect(interactionTitlePlaceholder(t)).toBe('Titre (facultatif)');
    await changeInterfaceLanguage('it');
    expect(interactionTitlePlaceholder(t)).toBe('Titolo (facoltativo)');
    await i18n.changeLanguage('en');
  });

  it('names an Interaction by its title, then its content, then a short reference', () => {
    expect(interactionLabelForDisplay(withContent(' Door ', '<p>Hello</p>'))).toBe('Door');
    expect(
      interactionLabelForDisplay(withContent('', '<p>The <b>lock</b> &amp; the key</p>')),
    ).toBe('The lock & the key');
    expect(
      interactionLabelForDisplay(
        withContent('', '<p>A very long opening sentence that keeps going and going</p>'),
      ),
    ).toBe('A very long opening sentence that keeps…');
    expect(interactionLabelForDisplay(withContent('', '<p> </p>', 'ab12-cd34'))).toBe('○ cd34');
    expect(interactionLabelForDisplay(withContent('', '', 'ab12-ef56'))).not.toBe(
      interactionLabelForDisplay(withContent('', '', 'ab12-cd34')),
    );
  });

  it('never stores or injects a generated title into the Interaction', () => {
    const untitled = withContent('', '<p>Hello</p>');
    interactionLabelForDisplay(untitled);
    expect(untitled.title).toBe('');
  });
});

describe('choice labels', () => {
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

describe('simulation title hint', () => {
  it('follows how the Simulation reached the Interaction', async () => {
    await i18n.changeLanguage('en');
    const t = i18n.t.bind(i18n);

    expect(simulationTitleHint('start', t)).toEqual({
      hint: 'Title (optional)',
      needsLabel: false,
    });
    expect(simulationTitleHint({ optionCount: 1 }, t)).toEqual({
      hint: 'Title (optional)',
      needsLabel: false,
    });
    expect(simulationTitleHint({ optionCount: 3 }, t)).toEqual({ hint: '', needsLabel: true });
    expect(simulationTitleHint(undefined, t)).toEqual({ hint: '', needsLabel: false });
    expect(choiceLabelForDisplay({ title: '' }, { index: 0, count: 1, start: true }, t).label).toBe(
      'Start',
    );
  });
});
