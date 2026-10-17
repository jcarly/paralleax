import { describe, expect, it } from 'vitest';
import {
  ensureRichTextTokenControls,
  getInteractionLinkText,
  getVariableMarkerExpression,
  serializeRichTextEditorHtml,
} from './richTextEditorTokens';

describe('rich-text editor token serialization', () => {
  it('restores authored variable and interaction-link markup from editor controls', () => {
    const editor = document.createElement('div');
    editor.innerHTML = [
      '<p>',
      '<span class="rich-text-variable-selected rich-text-token-dragging" data-stat-value="energy" draggable="true">',
      '<button data-rich-text-variable-edit data-rich-text-variable-source="{{hero.energy}}">Hero → Energy</button>',
      '<button data-rich-text-variable-remove>x</button>',
      '</span>',
      '<span class="rich-text-interaction-link-selected" data-interaction-link-target="room">',
      '<button data-rich-text-interaction-link-edit data-rich-text-interaction-link-text="Enter">Enter | Room</button>',
      '<button data-rich-text-interaction-link-remove>x</button>',
      '</span>',
      '</p>',
    ].join('');

    expect(serializeRichTextEditorHtml(editor)).toBe(
      '<p><span data-stat-value="energy">{{hero.energy}}</span><span data-interaction-link-target="room">Enter</span></p>',
    );
  });

  it('removes conditional presentation without changing the authored frame', () => {
    const editor = document.createElement('div');
    editor.innerHTML =
      '<span class="conditional-text conditional-text-unavailable custom" title="Unavailable" data-conditional-text-block="block-1"><span data-rich-text-conditional-controls="block-1">controls</span><span class="conditional-text-reason">reason</span>Authored text</span>';

    expect(serializeRichTextEditorHtml(editor)).toBe(
      '<span class="custom" data-conditional-text-block="block-1">Authored text</span>',
    );
  });

  it('creates reusable edit and remove controls while retaining token source helpers', () => {
    const marker = document.createElement('span');
    marker.textContent = '{{story.energy}}';

    const controls = ensureRichTextTokenControls(
      marker,
      'data-rich-text-variable-edit',
      'data-rich-text-variable-remove',
    );
    controls.editButton.dataset.richTextVariableSource = '{{story.energy}}';

    expect(getVariableMarkerExpression(marker)).toBe('story.energy');
    expect(controls.removeButton.textContent).toBe('x');

    const link = document.createElement('span');
    link.innerHTML =
      '<button data-rich-text-interaction-link-edit data-rich-text-interaction-link-text="Open door">Door</button>';
    expect(getInteractionLinkText(link)).toBe('Open door');
  });

  it('serializes an unavailable editor as empty content', () => {
    expect(serializeRichTextEditorHtml(null)).toBe('');
  });
});
