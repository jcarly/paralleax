import { describe, expect, it } from 'vitest';
import { evaluateExpression } from './index.js';
import { remapExpressionReferences } from './remap.js';

describe('expression reference remapping', () => {
  const mapping = {
    assignments: new Map([['score', 'new-score']]),
    items: new Map([['item', 'new-item']]),
  };

  it('remaps references in nested expressions while preserving the result', () => {
    const source = '(@{score|item} + score) * 2';
    const result = remapExpressionReferences(source, mapping);
    expect(result).toBe('(@{new-score|new-item} + @{new-score}) * 2');
    expect(evaluateExpression(source, { 'score|item': 3, score: 4 })).toBe(14);
    expect(evaluateExpression(result ?? '', { 'new-score|new-item': 3, 'new-score': 4 })).toBe(14);
  });

  it('does not replace names in string literals or unrelated references', () => {
    const source = "'score' == @{other}";
    expect(remapExpressionReferences(source, mapping)).toBe(source);
    expect(remapExpressionReferences("'score' == @{score}", mapping)).toBe(
      '"score" == @{new-score}',
    );
  });

  it('rejects invalid expressions rather than rewriting unparsed text', () => {
    expect(remapExpressionReferences('@{score', mapping)).toBeUndefined();
  });
});
