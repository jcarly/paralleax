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
    expect(after.groups!.map(({ id }) => id)).toEqual(['leaf', 'root', 'child']);
    expect(after.groups![0].parentGroupId).toBeUndefined();
    expect(after.interactions).toBe(before.interactions);
    expect(before.groups![2].parentGroupId).toBe('child');
    const delta = createStoryChangeDelta(before, after)!;
    const undo = applyStoryChangeDelta(after, delta, 'backward');
    expect(undo.applied).toBe(true);
    if (undo.applied) {
      expect(undo.story.groups).toEqual(before.groups);
      const redo = applyStoryChangeDelta(undo.story, delta, 'forward');
      expect(redo.applied).toBe(true);
      if (redo.applied) expect(redo.story.groups).toEqual(after.groups);
    }
    const nested = moveStoryGroup(after, 'leaf', 'root', 'child');
    expect(
      nested.groups!.filter(({ parentGroupId }) => parentGroupId === 'root').map(({ id }) => id),
    ).toEqual(['leaf', 'child']);
  });

  it('rejects invalid move references and cycles even for deep descendants', () => {
    const story = fixture();
    expect(getGroupDescendantIds(story.groups!, 'root')).toEqual(
      new Set(['root', 'child', 'leaf']),
    );
    expect(() => moveStoryGroup(story, 'root', 'leaf', null)).toThrow('cycles');
    expect(() => moveStoryGroup(story, 'root', 'root', null)).toThrow('cycles');
    expect(() => moveStoryGroup(story, 'leaf', 'foreign', null)).toThrow('same Story');
    expect(() => moveStoryGroup(story, 'leaf', null, 'child')).toThrow('sibling');
    expect(() => moveStoryGroup(story, 'leaf', null, 'foreign')).toThrow('sibling');
    expect(() => moveStoryGroup(story, 'missing', null, null)).toThrow('not found');
  });
  it('accepts old Stories and includes direct Interactions and child Groups in recursive navigation', () => {
    expect(validateStoryGroups({ ...fixture(), groups: undefined })).toBeUndefined();
    const story = fixture();
    const before = structuredClone(story);
    expect(validateStoryGroups(story)).toBeUndefined();
    expect(getGroupInteractionIds(story.groups!, 'root')).toEqual(['one', 'two']);
    expect(story).toEqual(before);
  });

  it('rejects direct membership in more than one group, including parent and child', () => {
    const story = fixture();
    story.groups![1].interactionIds.push('one');
    expect(validateStoryGroups(story)).toContain('only one Group');
  });

  it('moves direct membership while preserving mixed group contents and unrelated members', () => {
    const original = fixture();
    const updated = setStoryGroupInteractions(original, 'child', ['one', 'two']);
    expect(updated.groups![0].interactionIds).toEqual([]);
    expect(updated.groups![1].interactionIds).toEqual(['one', 'two']);
    expect(updated.groups![2].parentGroupId).toBe('child');
    expect(updated.interactions).toBe(original.interactions);
    expect(original.groups![0].interactionIds).toEqual(['one']);
    expect(validateStoryGroups(updated)).toBeUndefined();
    expect(getGroupInteractionIds(updated.groups!, 'root')).toEqual(['one', 'two']);
    const removed = setStoryGroupInteractions(updated, 'child', ['two']);
    expect(removed.groups![0].interactionIds).toEqual([]);
    expect(removed.groups![1].interactionIds).toEqual(['two']);
    expect(setStoryGroupInteractions(original, 'missing', ['one'])).toBe(original);
  });

  it('undoes a membership transfer atomically and rejects replay that would duplicate ownership', () => {
    const original = fixture();
    const updated = setStoryGroupInteractions(original, 'child', ['one', 'two']);
    const delta = createStoryChangeDelta(original, updated)!;
    const reversed = applyStoryChangeDelta(updated, delta, 'backward');
    expect(reversed.applied).toBe(true);
    if (reversed.applied) expect(reversed.story.groups).toEqual(original.groups);
    const later = fixture();
    later.groups![0].interactionIds = [];
    const removal = createStoryChangeDelta(original, later)!;
    const moved = setStoryGroupInteractions(later, 'leaf', ['one']);
    expect(applyStoryChangeDelta(moved, removal, 'backward').applied).toBe(false);
  });

  it('promotes children on deletion without losing interactions or descendants', () => {
    const story = fixture();
    const updated = removeStoryGroup(story, 'child');
    expect(updated.interactions).toBe(story.interactions);
    expect(updated.groups!.map(({ id }) => id)).toEqual(['root', 'leaf']);
    expect(updated.groups![1].parentGroupId).toBe('root');
    expect(removeStoryGroup(story, 'root').groups![0].parentGroupId).toBeUndefined();
    expect(removeStoryGroup(story, 'missing')).toBe(story);
  });

  it.each(['root', 'leaf'])('rejects a cycle when the root is placed under %s', (parentGroupId) => {
    const story = fixture();
    story.groups![0].parentGroupId = parentGroupId;
    expect(validateStoryGroups(story)).toContain('cycles');
  });

  it('rejects missing or foreign parents and members', () => {
    const story = fixture();
    story.groups![0].parentGroupId = 'foreign';
    expect(validateStoryGroups(story)).toContain('same Story');
    delete story.groups![0].parentGroupId;
    story.groups![0].interactionIds.push('missing');
    expect(validateStoryGroups(story)).toContain('same Story');
  });

  it('rejects an undo that would create a cycle after another author moves a group', () => {
    const before = fixture();
    const after = structuredClone(before);
    delete after.groups![1].parentGroupId;
    const delta = createStoryChangeDelta(before, after)!;
    after.groups![0].parentGroupId = 'child';
    expect(applyStoryChangeDelta(after, delta, 'backward')).toEqual({
      applied: false,
      conflicts: [{ path: '$.groups' }],
    });
  });

  it('rejects undo restoring membership after its interaction was deleted', () => {
    const before = fixture();
    const after = structuredClone(before);
    after.groups![0].interactionIds = [];
    const delta = createStoryChangeDelta(before, after)!;
    after.interactions = after.interactions.filter(({ id }) => id !== 'one');
    after.groups![1].interactionIds = ['two'];
    expect(applyStoryChangeDelta(after, delta, 'backward').applied).toBe(false);
  });
});
