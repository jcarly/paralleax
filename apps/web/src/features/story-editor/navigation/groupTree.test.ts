import { describe, expect, it } from 'vitest';
import type { Group } from '@paralleax/shared';
import { getGroupDropInput, projectGroupTree } from './groupTree';

const groups: Group[] = [
  { id: 'a', title: 'Act', interactionIds: ['one'] },
  { id: 'b', title: 'Scene', interactionIds: ['two'], parentGroupId: 'a' },
  { id: 'c', title: 'Nested', interactionIds: [], parentGroupId: 'b' },
  { id: 'd', title: 'Other', interactionIds: [] },
];
describe('group tree projection and drop targets', () => {
  it('rejects self and all descendants without consulting expansion state', () => {
    for (const groupId of ['a', 'b', 'c']) {
      for (const position of ['before', 'inside', 'after'] as const)
        expect(getGroupDropInput(groups, 'a', { groupId, position })).toBeUndefined();
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
  it('counts live recursive members and searches through collapsed ancestors', () => {
    const tree = projectGroupTree(groups, new Set(['one', 'two']), 'nested');
    expect(tree.counts.get('a')).toBe(2);
    expect(tree.counts.get('b')).toBe(1);
    expect(tree.matches).toEqual(new Set(['a', 'b', 'c']));
  });
});
