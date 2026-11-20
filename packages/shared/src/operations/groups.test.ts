import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import { applyStoryChangeDelta, createStoryChangeDelta } from '../history/story-history.js';
import {
  getGroupDescendantIds,
  moveStoryGroup,
  getGroupInteractionIds,
  removeStoryGroup,
  setStoryGroupInteractions,
  validateStoryGroups,
} from './groups.js';

function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description} to exist`);
  }
  return value;
}

function fixture(): Story {
  return {
    id: 'story',
    title: 'Groups',
    interactions: ['one', 'two'].map((id) => ({
      id,
      title: id,
      body: '',
      position: { x: 0, y: 0 },
      triggers: [],
    })),
    groups: [
      { id: 'root', title: 'Root', interactionIds: ['one'] },
      { id: 'child', title: 'Child', parentGroupId: 'root', interactionIds: ['two'] },
      { id: 'leaf', title: 'Leaf', parentGroupId: 'child', interactionIds: [] },
    ],
  };
}

describe('authored groups', () => {
  it('moves and reorders in canonical list order without moving Interactions, and reverses atomically', () => {
    const before = fixture();
    const after = moveStoryGroup(before, 'leaf', null, 'root');
    expect(requireValue(after.groups, 'after groups').map(({ id }) => id)).toEqual([
      'leaf',
      'root',
      'child',
    ]);
    expect(requireValue(after.groups, 'after groups')[0].parentGroupId).toBeUndefined();
    expect(after.interactions).toBe(before.interactions);
    expect(requireValue(before.groups, 'before groups')[2].parentGroupId).toBe('child');
    const delta = requireValue(createStoryChangeDelta(before, after), 'story change delta');
    const undo = applyStoryChangeDelta(after, delta, 'backward');
    expect(undo.applied).toBe(true);
    if (undo.applied) {
      expect(undo.story.groups).toEqual(before.groups);
      const redo = applyStoryChangeDelta(undo.story, delta, 'forward');
      expect(redo.applied).toBe(true);
      if (redo.applied) {
        expect(redo.story.groups).toEqual(after.groups);
      }
    }
    const nested = moveStoryGroup(after, 'leaf', 'root', 'child');
    expect(
      requireValue(nested.groups, 'nested groups')
        .filter(({ parentGroupId }) => parentGroupId === 'root')
        .map(({ id }) => id),
    ).toEqual(['leaf', 'child']);
  });

  it('rejects invalid move references and cycles even for deep descendants', () => {
    const story = fixture();
    expect(getGroupDescendantIds(requireValue(story.groups, 'story groups'), 'root')).toEqual(
      new Set(['root', 'child', 'leaf']),
    );
    expect(() => moveStoryGroup(story, 'root', 'leaf', null)).toThrow('cycles');
    expect(() => moveStoryGroup(story, 'root', 'root', null)).toThrow('cycles');
    expect(() => moveStoryGroup(story, 'leaf', 'foreign', null)).toThrow('same Story');
    expect(() => moveStoryGroup(story, 'leaf', 'foreign', 'missing')).toThrow('same Story');
    expect(() => moveStoryGroup(story, 'leaf', null, 'child')).toThrow('sibling');
    expect(() => moveStoryGroup(story, 'leaf', null, 'foreign')).toThrow('sibling');
    expect(() => moveStoryGroup(story, 'missing', null, null)).toThrow('not found');
  });
  it('accepts old Stories and includes direct Interactions and child Groups in recursive navigation', () => {
    expect(validateStoryGroups({ ...fixture(), groups: undefined })).toBeUndefined();
    const story = fixture();
    const before = structuredClone(story);
    expect(validateStoryGroups(story)).toBeUndefined();
    expect(getGroupInteractionIds(requireValue(story.groups, 'story groups'), 'root')).toEqual([
      'one',
      'two',
    ]);
    expect(story).toEqual(before);
  });

  it('rejects direct membership in more than one group, including parent and child', () => {
    const story = fixture();
    requireValue(story.groups, 'story groups')[1].interactionIds.push('one');
    expect(validateStoryGroups(story)).toContain('only one Group');
  });

  it('moves direct membership while preserving mixed group contents and unrelated members', () => {
    const original = fixture();
    const updated = setStoryGroupInteractions(original, 'child', ['one', 'two']);
    expect(requireValue(updated.groups, 'updated groups')[0].interactionIds).toEqual([]);
    expect(requireValue(updated.groups, 'updated groups')[1].interactionIds).toEqual([
      'one',
      'two',
    ]);
    expect(requireValue(updated.groups, 'updated groups')[2].parentGroupId).toBe('child');
    expect(updated.interactions).toBe(original.interactions);
    expect(requireValue(original.groups, 'original groups')[0].interactionIds).toEqual(['one']);
    expect(validateStoryGroups(updated)).toBeUndefined();
    expect(getGroupInteractionIds(requireValue(updated.groups, 'updated groups'), 'root')).toEqual([
      'one',
      'two',
    ]);
    const removed = setStoryGroupInteractions(updated, 'child', ['two']);
    expect(requireValue(removed.groups, 'removed groups')[0].interactionIds).toEqual([]);
    expect(requireValue(removed.groups, 'removed groups')[1].interactionIds).toEqual(['two']);
    expect(setStoryGroupInteractions(original, 'missing', ['one'])).toBe(original);
  });

  it('undoes a membership transfer atomically and rejects replay that would duplicate ownership', () => {
    const original = fixture();
    const updated = setStoryGroupInteractions(original, 'child', ['one', 'two']);
    const delta = requireValue(createStoryChangeDelta(original, updated), 'story change delta');
    const reversed = applyStoryChangeDelta(updated, delta, 'backward');
    expect(reversed.applied).toBe(true);
    if (reversed.applied) {
      expect(reversed.story.groups).toEqual(original.groups);
    }
    const later = fixture();
    requireValue(later.groups, 'later groups')[0].interactionIds = [];
    const removal = requireValue(createStoryChangeDelta(original, later), 'story change delta');
    const moved = setStoryGroupInteractions(later, 'leaf', ['one']);
    expect(applyStoryChangeDelta(moved, removal, 'backward').applied).toBe(false);
  });

  it('promotes children on deletion without losing interactions or descendants', () => {
    const story = fixture();
    const updated = removeStoryGroup(story, 'child');
    expect(updated.interactions).toBe(story.interactions);
    expect(requireValue(updated.groups, 'updated groups').map(({ id }) => id)).toEqual([
      'root',
      'leaf',
    ]);
    expect(requireValue(updated.groups, 'updated groups')[1].parentGroupId).toBe('root');
    expect(
      requireValue(removeStoryGroup(story, 'root').groups, 'remaining groups')[0].parentGroupId,
    ).toBeUndefined();
    expect(removeStoryGroup(story, 'missing')).toBe(story);
  });

  it.each(['root', 'leaf'])('rejects a cycle when the root is placed under %s', (parentGroupId) => {
    const story = fixture();
    requireValue(story.groups, 'story groups')[0].parentGroupId = parentGroupId;
    expect(validateStoryGroups(story)).toContain('cycles');
  });

  it('rejects missing or foreign parents and members', () => {
    const story = fixture();
    requireValue(story.groups, 'story groups')[0].parentGroupId = 'foreign';
    expect(validateStoryGroups(story)).toContain('same Story');
    delete requireValue(story.groups, 'story groups')[0].parentGroupId;
    requireValue(story.groups, 'story groups')[0].interactionIds.push('missing');
    expect(validateStoryGroups(story)).toContain('same Story');
  });

  it('preserves group validation error order', () => {
    const story = fixture();
    const [root, child] = story.groups ?? [];
    if (!root || !child) {
      throw new Error('Fixture groups are missing');
    }
    root.parentGroupId = child.id;
    root.interactionIds.push('missing');
    expect(validateStoryGroups(story)).toBe('Group members must belong to the same Story');

    root.interactionIds = ['one'];
    root.parentGroupId = 'foreign';
    child.title = '';
    expect(validateStoryGroups(story)).toBe('Group parent must belong to the same Story');
  });

  it('rejects an undo that would create a cycle after another author moves a group', () => {
    const before = fixture();
    const after = structuredClone(before);
    delete requireValue(after.groups, 'after groups')[1].parentGroupId;
    const delta = requireValue(createStoryChangeDelta(before, after), 'story change delta');
    requireValue(after.groups, 'after groups')[0].parentGroupId = 'child';
    expect(applyStoryChangeDelta(after, delta, 'backward')).toEqual({
      applied: false,
      conflicts: [{ path: '$.groups' }],
    });
  });

  it('rejects undo restoring membership after its interaction was deleted', () => {
    const before = fixture();
    const after = structuredClone(before);
    requireValue(after.groups, 'after groups')[0].interactionIds = [];
    const delta = requireValue(createStoryChangeDelta(before, after), 'story change delta');
    after.interactions = after.interactions.filter(({ id }) => id !== 'one');
    requireValue(after.groups, 'after groups')[1].interactionIds = ['two'];
    expect(applyStoryChangeDelta(after, delta, 'backward').applied).toBe(false);
  });
});
