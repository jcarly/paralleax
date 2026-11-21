import { describe, expect, it } from 'vitest';
import { nativeStoryContentSchema } from './native-story-schema.js';

describe('native Story content structure', () => {
  const valid = {
    title: 'Story',
    interactions: [{ id: 'a', title: '', body: '', position: { x: 1, y: 2 }, triggers: [] }],
  };

  it('accepts structured authored content', () => {
    expect(nativeStoryContentSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing fields and unsupported persistence metadata', () => {
    expect(nativeStoryContentSchema.safeParse({ title: 'Story' }).success).toBe(false);
    expect(nativeStoryContentSchema.safeParse({ ...valid, owner: { id: 'user' } }).success).toBe(
      false,
    );
    expect(
      nativeStoryContentSchema.safeParse({
        ...valid,
        interactions: [{ ...valid.interactions[0], secret: 'unsupported' }],
      }).success,
    ).toBe(false);
  });

  it('reports the path of invalid nested values', () => {
    const result = nativeStoryContentSchema.safeParse({
      ...valid,
      interactions: [{ ...valid.interactions[0], position: { x: 'bad', y: 2 } }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['interactions', 0, 'position', 'x']);
    }
  });

  it('rejects identifiers that can corrupt object-keyed runtime state', () => {
    for (const id of ['', '__proto__', 'prototype', 'constructor']) {
      const result = nativeStoryContentSchema.safeParse({
        ...valid,
        interactions: [{ ...valid.interactions[0], id }],
      });
      expect(result.success).toBe(false);
    }
  });
});
