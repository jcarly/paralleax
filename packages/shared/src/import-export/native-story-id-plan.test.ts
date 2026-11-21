import { describe, expect, it } from 'vitest';
import type { NativeStoryContent } from './native-story.js';
import { planNativeStoryIdRemapping } from './native-story-id-plan.js';

const story: NativeStoryContent = {
  title: 'Story',
  characters: [{ id: 'a', name: 'A', description: '' }],
  interactions: [
    { id: 'a', title: '', body: '', position: { x: 0, y: 0 }, triggers: [] },
    { id: 'a-0', title: '', body: '', position: { x: 1, y: 1 }, triggers: [] },
  ],
};

describe('native Story ID remapping plan', () => {
  it('replaces collisions only and reserves unmodified IDs before allocating', () => {
    const isOccupied = (kind: string, id: string) =>
      kind === 'interaction' && (id === 'a' || id === 'a-1');
    const plan = planNativeStoryIdRemapping(
      story,
      isOccupied,
      (_kind, id, attempt) => `${id}-${attempt}`,
    );
    expect(plan.interaction?.get('a')).toBe('a-2');
    expect(plan.interaction?.has('a-0')).toBe(false);
    expect(plan.character).toBeUndefined();
    expect(
      planNativeStoryIdRemapping(story, isOccupied, (_kind, id, attempt) => `${id}-${attempt}`),
    ).toEqual(plan);
  });

  it('rejects ambiguous IDs before planning', () => {
    const duplicated = { ...story, interactions: [...story.interactions, story.interactions[0]] };
    expect(() =>
      planNativeStoryIdRemapping(
        duplicated,
        () => false,
        () => 'new',
      ),
    ).toThrow('Cannot remap duplicate identifiers');
  });

  it('bounds attempts when the allocator cannot find a free identifier', () => {
    expect(() =>
      planNativeStoryIdRemapping(
        story,
        () => true,
        () => 'occupied',
      ),
    ).toThrow('Cannot allocate a unique Story identifier');
  });
});
