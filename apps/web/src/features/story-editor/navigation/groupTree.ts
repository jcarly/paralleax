import { getGroupDescendantIds, type Group, type UpdateGroupInput } from '@paralleax/shared';

export interface GroupDropTarget {
  groupId?: string;
  position: 'before' | 'inside' | 'after' | 'root';
}

/** Resolve a transient pointer target into the existing atomic Group update contract. */
export function getGroupDropInput(
  groups: readonly Group[],
  sourceId: string,
  target: GroupDropTarget,
): UpdateGroupInput | undefined {
  if (!groups.some(({ id }) => id === sourceId)) return;
  if (target.position === 'root') return { parentGroupId: null, beforeGroupId: null };
  const group = groups.find(({ id }) => id === target.groupId);
  if (!group || getGroupDescendantIds(groups, sourceId).has(group.id)) return;
  if (target.position === 'inside') return { parentGroupId: group.id, beforeGroupId: null };
  const siblings = groups.filter(
    (candidate) => candidate.parentGroupId === group.parentGroupId && candidate.id !== sourceId,
  );
  return {
    parentGroupId: group.parentGroupId ?? null,
    beforeGroupId:
      target.position === 'before' ? group.id : (siblings[siblings.indexOf(group) + 1]?.id ?? null),
  };
}

export function projectGroupTree(
  groups: readonly Group[],
  liveInteractionIds: ReadonlySet<string>,
  query: string,
) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const children = new Map<string | undefined, Group[]>();
  const counts = new Map<string, number>();
  const matches = new Set<string>();
  const normalized = query.trim().toLocaleLowerCase();
  for (const group of groups) {
    const siblings = children.get(group.parentGroupId) ?? [];
    siblings.push(group);
    children.set(group.parentGroupId, siblings);
    const direct = group.interactionIds.filter((id) => liveInteractionIds.has(id)).length;
    const visited = new Set<string>();
    let current: Group | undefined = group;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      counts.set(current.id, (counts.get(current.id) ?? 0) + direct);
      current = byId.get(current.parentGroupId ?? '');
    }
    if (normalized && group.title.toLocaleLowerCase().includes(normalized)) {
      for (const id of visited) matches.add(id);
    }
  }
  return { byId, children, counts, matches, searching: Boolean(normalized) };
}
