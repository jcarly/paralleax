import { describe, expect, it } from 'vitest';
import { resources } from './resources';

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
    const english = collectStrings(resources.en.translation);
    const italian = collectStrings(resources.it.translation);

    expect([...italian.keys()].sort()).toEqual([...english.keys()].sort());
    for (const [key, englishValue] of english) {
      expect(placeholders(italian.get(key) ?? '')).toEqual(placeholders(englishValue));
    }
  });
});
