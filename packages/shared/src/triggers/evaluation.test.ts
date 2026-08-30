import { describe, expect, it } from 'vitest';
import { doConditionsMatch } from './evaluation.js';

describe('condition group evaluation', () => {
  it('requires every condition in the group to match', () => {
    const conditions = [
      { interactionId: 'intro', hasBeenVisited: true },
      { statId: 'score', operator: 'gte' as const, value: 5 },
    ];

    expect(doConditionsMatch(conditions, new Set(['intro']), null, [], { score: 5 })).toBe(true);
    expect(doConditionsMatch(conditions, new Set(['intro']), null, [], { score: 4 })).toBe(false);
    expect(doConditionsMatch(conditions, new Set(), null, [], { score: 5 })).toBe(false);
  });
});
