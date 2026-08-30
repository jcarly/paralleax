import type { Story } from '@paralleax/shared';
import { sanitizeRichText } from './rich-text';

describe('sanitizeRichText stat interpolation', () => {
  it('lowers unique author references to stable inert markers', () => {
    const sanitized = sanitizeRichText(
      '<p>{{Mira.Energy}} / {{story.Energy}} / {{battery-1.Charge}}</p>',
      storyFixture(),
    );

    expect(sanitized).toBe(
      '<p><span contenteditable="false" data-stat-value="mira-energy">{{Mira.Energy}}</span> / ' +
        '<span contenteditable="false" data-stat-value="story-energy">{{story.Energy}}</span> / ' +
        '<span contenteditable="false" data-stat-value="battery-charge" data-stat-item="battery-1">' +
        '{{battery-1.Charge}}</span></p>',
    );
  });

  it('preserves unresolved references for correction and does not nest saved markers', () => {
    const story = storyFixture();
    const unresolved = sanitizeRichText('<p>{{Unknown.Energy}}</p>', story);
    const compiled = sanitizeRichText('<p>{{Mira.Energy}}</p>', story);
    const saved = sanitizeRichText(compiled, story);

    expect(unresolved).toBe('<p>{{Unknown.Energy}}</p>');
    expect(saved).toBe(compiled);
    expect(saved.match(/data-stat-value/g)).toHaveLength(1);
  });

  it('keeps invalid numeric entities inert instead of throwing during resolution', () => {
    expect(() =>
      sanitizeRichText('<p>{{Mira&#99999999;.Energy}}</p>', storyFixture()),
    ).not.toThrow();
  });

  it('does not interpret pseudo-code embedded in conditional navigation labels', () => {
    const sanitized = sanitizeRichText(
      '<button data-conditional-text-link="next">{{Mira.Energy}}</button>',
      storyFixture(),
    );

    expect(sanitized).toContain('{{Mira.Energy}}');
    expect(sanitized).not.toContain('data-stat-value');
  });

  it('preserves same-story interaction links and strips unknown targets', () => {
    const story = storyFixture();

    expect(
      sanitizeRichText('<p><span data-interaction-link-target="next">Continue</span></p>', story),
    ).toBe(
      '<p><span data-interaction-link-target="next" contenteditable="false">Continue</span></p>',
    );
    expect(
      sanitizeRichText(
        '<p><span data-interaction-link-target="outside">Continue</span></p>',
        story,
      ),
    ).toBe('<p><span>Continue</span></p>');
  });

  it('preserves structured conditional text block markers without editor controls', () => {
    expect(
      sanitizeRichText(
        '<div data-conditional-text-block="clue" class="conditional-text">' +
          '<div data-rich-text-conditional-controls="clue">Controls</div><p>Clue</p></div>',
        storyFixture(),
      ),
    ).toBe('<div data-conditional-text-block="clue"><p>Clue</p></div>');

    expect(
      sanitizeRichText(
        '<p>Before <span data-conditional-text-block="detail" class="conditional-text">' +
          '<span data-rich-text-conditional-controls="detail">Controls</span>detail</span> after</p>',
        storyFixture(),
      ),
    ).toBe('<p>Before <span data-conditional-text-block="detail">detail</span> after</p>');
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:00:00.000Z',
    statDefinitions: [
      { id: 'energy-definition', name: 'Energy', valueType: 'number' },
      { id: 'charge-definition', name: 'Charge', valueType: 'number' },
    ],
    stats: [{ id: 'story-energy', statDefinitionId: 'energy-definition', initialValue: 1 }],
    characters: [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'mira-energy', statDefinitionId: 'energy-definition', initialValue: 5 }],
        items: [{ id: 'battery-1', itemDefinitionId: 'battery-definition' }],
      },
    ],
    itemDefinitions: [
      {
        id: 'battery-definition',
        name: 'Battery',
        description: '',
        stats: [{ id: 'battery-charge', statDefinitionId: 'charge-definition', initialValue: 10 }],
      },
    ],
    interactions: [
      {
        id: 'next',
        title: 'Next',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [],
      },
    ],
  };
}
