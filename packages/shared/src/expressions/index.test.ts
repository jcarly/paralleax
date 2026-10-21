import { describe, expect, it } from 'vitest';
import {
  evaluateExpression,
  expressionReferencesAny,
  getExpressionReferences,
  inferExpressionType,
  parseExpression,
  serializeExpression,
  variableReference,
  type ExpressionNode,
} from './index.js';

describe('expression engine', () => {
  it('parses and serializes a canonical arithmetic expression', () => {
    const expr = '@{health} - @{damage} + 10 * 2';
    const parsed = parseExpression(expr);
    expect(parsed).toBeDefined();
    expect(serializeExpression(parsed as ExpressionNode)).toBe(expr);
  });

  it('evaluates arithmetic with the standard operator precedence', () => {
    const values = { health: 10, damage: 3 };
    expect(evaluateExpression('@{health} - @{damage} + 10 * 2', values)).toBe(27);
    expect(evaluateExpression('@{health} / 2 + 3', values)).toBe(8);
    expect(evaluateExpression('(@{health} - @{damage}) * 2', values)).toBe(14);
    const grouped = parseExpression('(@{health} - @{damage}) * 2');
    expect(serializeExpression(grouped as ExpressionNode)).toBe('(@{health} - @{damage}) * 2');
  });

  it('supports negative and decimal values', () => {
    expect(evaluateExpression('-3.5 + 1.5', {})).toBe(-2);
    expect(evaluateExpression('@{health} >= 10.5', { health: 10.6 })).toBe(true);
  });

  it('evaluates comparisons using typed values', () => {
    expect(evaluateExpression('@{health} == 10', { health: 10 })).toBe(true);
    expect(evaluateExpression('@{ready} == true', { ready: true })).toBe(true);
    expect(evaluateExpression('@{name} != "hero"', { name: 'hero' })).toBe(false);
  });

  it('reports invalid references and division by zero explicitly', () => {
    const result = evaluateExpression('@{missing} + 1', {});
    expect(result).toEqual({ ok: false, error: 'Unknown variable reference: missing' });

    const division = evaluateExpression('@{health} / 0', { health: 10 });
    expect(division).toEqual({ ok: false, error: 'Division by zero' });
  });

  it('keeps stable references independent from display names', () => {
    const ref = variableReference('assignment-123', 'instance-789');
    expect(ref).toBe('@{assignment-123|instance-789}');
  });

  it('collects references and infers a typed result', () => {
    expect(getExpressionReferences('@{health} + @{bonus|sword}')).toEqual([
      { id: 'health' },
      { id: 'bonus', itemId: 'sword' },
    ]);
    expect(
      inferExpressionType('@{health} + 2', ({ id }) => (id === 'health' ? 'number' : undefined)),
    ).toBe('number');
    expect(inferExpressionType('@{health} + true', () => 'number')).toBeUndefined();
    expect(expressionReferencesAny('@{health} + 2', new Set(['health']))).toBe(true);
  });
});
