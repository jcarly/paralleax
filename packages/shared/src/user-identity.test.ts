import { describe, expect, it } from 'vitest';
import { isValidUserDisplayName, normalizeUserDisplayName } from './user-identity.js';

describe('user display identities', () => {
  it('normalizes surrounding and repeated whitespace without changing visible characters', () => {
    expect(normalizeUserDisplayName('  Alice   de\tParis  ')).toBe('Alice de Paris');
  });

  it('accepts broad Unicode names and enforces the public length bounds', () => {
    expect(isValidUserDisplayName('Éloïse 🌿')).toBe(true);
    expect(isValidUserDisplayName('x')).toBe(false);
    expect(isValidUserDisplayName('x'.repeat(51))).toBe(false);
  });
});
