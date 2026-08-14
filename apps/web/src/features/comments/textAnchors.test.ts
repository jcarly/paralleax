import { describe, expect, it } from 'vitest';
import { captureActiveTextSelection, makeSelection } from './textAnchors';

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

  it('rejects an empty selection', () => {
    expect(makeSelection('No note', 'title', 2, 2)).toBeUndefined();
  });

  it('rejects a selection that is too large for a stable review quote', () => {
    const longValue = 'a'.repeat(1_001);
    expect(makeSelection(longValue, 'body', 0, longValue.length)).toBeUndefined();
  });
});
