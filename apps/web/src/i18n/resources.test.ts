import { describe, expect, it } from 'vitest';
import { englishTranslation } from './english';
import { frenchTranslation } from './french';
import { italianTranslation } from './italian';

function collectStrings(value: unknown, path = '', result = new Map<string, string>()) {
  if (typeof value === 'string') {
    result.set(path, value);
    return result;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectStrings(child, path ? `${path}.${key}` : key, result);
  }
  return result;
}

function placeholders(value: string) {
  return value.match(/\{\{[^{}]+\}\}/g)?.sort() ?? [];
}

describe('Italian interface resources', () => {
  it('matches the English catalogue and preserves interpolation variables', () => {
    const english = collectStrings(englishTranslation);
    const italian = collectStrings(italianTranslation);

    expect([...italian.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, englishValue] of english) {
      expect(placeholders(italian.get(key) ?? '')).toEqual(placeholders(englishValue));
    }
  });
});

describe('condition operator resources', () => {
  const symbols = {
    eq: '=',
    neq: '≠',
    lt: '<',
    lte: '≤',
    gt: '>',
    gte: '≥',
  };

  it.each([
    ['English', englishTranslation],
    ['French', frenchTranslation],
    ['Italian', italianTranslation],
  ])('uses mathematical symbols throughout the %s interface', (_language, translation) => {
    expect(translation.player.condition.operator).toEqual(symbols);
    expect(translation.player.requirement.operator).toEqual(symbols);
    expect({
      eq: translation.triggerInspector.equals,
      neq: translation.triggerInspector.notEquals,
      lt: translation.triggerInspector.lessThan,
      lte: translation.triggerInspector.atMost,
      gt: translation.triggerInspector.greaterThan,
      gte: translation.triggerInspector.atLeast,
    }).toEqual(symbols);
  });
});
