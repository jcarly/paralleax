import { afterEach, describe, expect, it } from 'vitest';
import { captureActiveTextSelection, makeSelection } from './textAnchors';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe('comment text anchors', () => {
  it('stores the quote, context, offsets, and source hash', () => {
    expect(makeSelection('The old harbor is quiet.', 'description', 8, 14)).toEqual({
      field: 'description',
      selector: {
        exact: 'harbor',
        prefix: 'The old ',
        suffix: ' is quiet.',
        start: 8,
        end: 14,
        sourceHash: expect.stringMatching(/^[0-9a-f]{8}$/),
      },
    });
  });

  it('captures a selection in an inspector input', () => {
    const input = document.createElement('input');
    input.dataset.commentField = 'name';
    input.value = 'Old harbor';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(4, 10);

    expect(captureActiveTextSelection()).toMatchObject({
      field: 'name',
      selector: { exact: 'harbor', start: 4, end: 10 },
    });
    input.remove();
  });

  it('captures a DOM range inside a marked rich-text surface', () => {
    const surface = document.createElement('div');
    surface.dataset.commentField = 'body';
    surface.textContent = 'The old harbor is quiet.';
    document.body.append(surface);
    const text = surface.firstChild!;
    const range = document.createRange();
    range.setStart(text, 8);
    range.setEnd(text, 14);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(captureActiveTextSelection()).toMatchObject({
      field: 'body',
      selector: { exact: 'harbor', start: 8, end: 14 },
    });
  });

  it('captures a selection from a focused editable surface', () => {
    const surface = document.createElement('div');
    surface.dataset.commentField = 'description';
    surface.textContent = 'Old harbor';
    surface.tabIndex = 0;
    Object.defineProperty(surface, 'isContentEditable', { value: true });
    document.body.append(surface);
    surface.focus();
    const text = surface.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(captureActiveTextSelection()).toMatchObject({
      field: 'description',
      selector: { exact: 'harbor', start: 4, end: 10 },
    });
  });

  it('ignores focus and selections outside commentable fields', () => {
    expect(captureActiveTextSelection()).toBeUndefined();

    const input = document.createElement('input');
    input.value = 'No field';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(0, 2);

    expect(captureActiveTextSelection()).toBeUndefined();
  });

  it('rejects an empty selection', () => {
    expect(makeSelection('No note', 'title', 2, 2)).toBeUndefined();
  });

  it('rejects a selection that is too large for a stable review quote', () => {
    const longValue = 'a'.repeat(1_001);
    expect(makeSelection(longValue, 'body', 0, longValue.length)).toBeUndefined();
  });
});
