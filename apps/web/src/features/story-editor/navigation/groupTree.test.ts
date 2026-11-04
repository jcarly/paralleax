import { describe, expect, it } from 'vitest';
import type { Group } from '@paralleax/shared';
import { getGroupDropInput, getVisibleGroupExplorerEntries, projectGroupTree } from './groupTree';

const groups: Group[] = [
  { id: 'a', title: 'Act', interactionIds: ['one'] },
  { id: 'b', title: 'Scene', interactionIds: ['two'], parentGroupId: 'a' },
  { id: 'c', title: 'Nested', interactionIds: [], parentGroupId: 'b' },
  { id: 'd', title: 'Other', interactionIds: [] },
];

describe('group drop targets', () => {
  it('rejects self and descendant drops', () => {
    for (const groupId of ['a', 'b', 'c']) {
      for (const position of ['before', 'inside', 'after'] as const) {
        expect(getGroupDropInput(groups, 'a', { groupId, position })).toBeUndefined();
      }
    }
  });

  it('resolves nesting, root moves and sibling ordering into one update', () => {
    expect(getGroupDropInput(groups, 'd', { groupId: 'b', position: 'inside' })).toEqual({
      parentGroupId: 'b',
      beforeGroupId: null,
    });
    expect(getGroupDropInput(groups, 'b', { position: 'root' })).toEqual({
      parentGroupId: null,
      beforeGroupId: null,
    });
    expect(getGroupDropInput(groups, 'd', { groupId: 'a', position: 'before' })).toEqual({
      parentGroupId: null,
      beforeGroupId: 'a',
    });
    expect(getGroupDropInput(groups, 'd', { groupId: 'b', position: 'after' })).toEqual({
      parentGroupId: 'a',
      beforeGroupId: null,
    });
    expect(getGroupDropInput(groups, 'missing', { position: 'root' })).toBeUndefined();
    expect(
      getGroupDropInput(groups, 'd', { groupId: 'missing', position: 'inside' }),
    ).toBeUndefined();
  });
});

describe('group tree search and ordering', () => {
  it('counts live recursive members and searches through collapsed ancestors', () => {
    const tree = projectGroupTree(groups, new Set(['one', 'two']), 'nested');
    expect(tree.counts.get('a')).toBe(2);
    expect(tree.counts.get('b')).toBe(1);
    expect(tree.matches).toEqual(new Set(['a', 'b', 'c']));
    expect(tree.expandedMatches).toEqual(new Set(['a', 'b']));
  });

  it('keeps group-title matches collapsed and expands paths to matching members', () => {
    const story = storyWithGroups();
    const groupMatch = projectGroupTree(groups, new Set(['one', 'two']), 'act');
    const titleEntries = getVisibleGroupExplorerEntries({
      story,
      tree: groupMatch,
      matchingInteractionIds: new Set(),
      expandedIds: new Set(),
    });
    expect(titleEntries.map(entryId)).toEqual(['a']);

    const memberMatch = projectGroupTree(groups, new Set(['one', 'two']), 'mira', new Set(['two']));
    const memberEntries = getVisibleGroupExplorerEntries({
      story,
      tree: memberMatch,
      matchingInteractionIds: new Set(['two']),
      expandedIds: new Set(),
    });
    expect(memberEntries.map(entryId)).toEqual(['a', 'b', 'two']);
  });

  it('shows subgroups before direct interactions in authored order', () => {
    const story = storyWithGroups();
    const tree = projectGroupTree(groups, new Set(['one', 'two']), '');
    const entries = getVisibleGroupExplorerEntries({
      story,
      tree,
      matchingInteractionIds: new Set(),
      expandedIds: new Set(['a', 'b']),
    });
    expect(entries.map(entryId)).toEqual(['a', 'b', 'c', 'two', 'one', 'd']);
  });
});

function entryId(entry: ReturnType<typeof getVisibleGroupExplorerEntries>[number]) {
  return entry.type === 'group' ? entry.group.id : entry.interaction.id;
}

function storyWithGroups() {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '',
    updatedAt: '',
    groups,
    interactions: ['one', 'two', 'd'].map((id) => ({
      id,
      title: id,
      body: '',
      position: { x: 0, y: 0 },
      triggers: [],
    })),
  };
}
