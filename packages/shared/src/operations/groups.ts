import type { Group, Story } from '../model/index.js';

/** Includes the group itself, independently of any editor expansion state. */
export function getGroupDescendantIds(groups: readonly Group[], groupId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const group of groups) {
    if (!group.parentGroupId) {
      continue;
    }
    const siblings = children.get(group.parentGroupId) ?? [];
    siblings.push(group.id);
    children.set(group.parentGroupId, siblings);
  }
  const result = new Set<string>();
  const pending = [groupId];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined) {
      continue;
    }
    if (result.has(id)) {
      continue;
    }
    result.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return result;
}

/** Move within canonical list order. The caller persists this as one authored mutation. */
export function moveStoryGroup(
  story: Story,
  groupId: string,
  parentGroupId: string | null,
  beforeGroupId: string | null,
): Story {
  const groups = story.groups ?? [];
  const group = groups.find(({ id }) => id === groupId);
  if (!group) {
    throw new Error('Group not found');
  }
  validateGroupMoveParent(groups, groupId, parentGroupId);
  const remaining = groups.filter(({ id }) => id !== groupId);
  const sibling = findGroupMoveSibling(remaining, parentGroupId, beforeGroupId);
  const moved = { ...group };
  delete moved.parentGroupId;
  if (parentGroupId !== null) {
    moved.parentGroupId = parentGroupId;
  }
  const index = sibling ? remaining.indexOf(sibling) : remaining.length;
  remaining.splice(index, 0, moved);
  return { ...story, groups: remaining };
}

function validateGroupMoveParent(
  groups: readonly Group[],
  groupId: string,
  parentGroupId: string | null,
): void {
  if (parentGroupId === null) {
    return;
  }
  if (!groups.some(({ id }) => id === parentGroupId)) {
    throw new Error('Group parent must belong to the same Story');
  }
  if (getGroupDescendantIds(groups, groupId).has(parentGroupId)) {
    throw new Error('Group hierarchy must not contain cycles');
  }
}

function findGroupMoveSibling(
  groups: readonly Group[],
  parentGroupId: string | null,
  beforeGroupId: string | null,
): Group | undefined {
  if (beforeGroupId === null) {
    return undefined;
  }
  const sibling = groups.find(({ id }) => id === beforeGroupId);
  if (!sibling || (sibling.parentGroupId ?? null) !== parentGroupId) {
    throw new Error('Group destination must be a sibling in the same Story');
  }
  return sibling;
}

/** Validate canonical organization, including after history replay. */
export function validateStoryGroups(story: Story): string | undefined {
  const groups = story.groups ?? [];
  const byId = new Map(groups.map((group) => [group.id, group]));
  if (byId.size !== groups.length) {
    return 'Group ids must be unique';
  }
  const interactions = new Set(story.interactions.map(({ id }) => id));
  const assignedInteractions = new Set<string>();
  for (const group of groups) {
    const membershipError = validateGroupMemberships(group, interactions, assignedInteractions);
    if (membershipError) {
      return membershipError;
    }
    const hierarchyError = validateGroupHierarchy(group, byId);
    if (hierarchyError) {
      return hierarchyError;
    }
  }
  return undefined;
}

function validateGroupMemberships(
  group: Group,
  interactions: ReadonlySet<string>,
  assignedInteractions: Set<string>,
): string | undefined {
  if (!group.title.trim() || group.title.length > 200) {
    return 'Group title must contain 1 to 200 characters';
  }
  if (new Set(group.interactionIds).size !== group.interactionIds.length) {
    return 'Group Interaction members must be unique';
  }
  if (group.interactionIds.some((id) => !interactions.has(id))) {
    return 'Group members must belong to the same Story';
  }
  for (const id of group.interactionIds) {
    if (assignedInteractions.has(id)) {
      return 'An Interaction may belong directly to only one Group';
    }
    assignedInteractions.add(id);
  }
  return undefined;
}

function validateGroupHierarchy(
  group: Group,
  groupsById: ReadonlyMap<string, Group>,
): string | undefined {
  const ancestors = new Set([group.id]);
  let parentId = group.parentGroupId;
  while (parentId !== undefined) {
    if (ancestors.has(parentId)) {
      return 'Group hierarchy must not contain cycles';
    }
    const parent = groupsById.get(parentId);
    if (!parent) {
      return 'Group parent must belong to the same Story';
    }
    ancestors.add(parentId);
    parentId = parent.parentGroupId;
  }
  return undefined;
}

/** Replacing direct members transfers them atomically from their previous Groups. */
export function setStoryGroupInteractions(
  story: Story,
  groupId: string,
  interactionIds: readonly string[],
): Story {
  if (!story.groups?.some(({ id }) => id === groupId)) {
    return story;
  }
  const assignedIds = new Set(interactionIds);
  return {
    ...story,
    groups: story.groups.map((group) => {
      if (group.id === groupId) {
        return { ...group, interactionIds: [...interactionIds] };
      }
      const remaining = group.interactionIds.filter((id) => !assignedIds.has(id));
      return remaining.length === group.interactionIds.length
        ? group
        : { ...group, interactionIds: remaining };
    }),
  };
}

/** Removing a container promotes its children to its parent, preserving all members. */
export function removeStoryGroup(story: Story, groupId: string): Story {
  const groups = story.groups ?? [];
  const removed = groups.find(({ id }) => id === groupId);
  if (!removed) {
    return story;
  }
  return {
    ...story,
    groups: groups
      .filter(({ id }) => id !== groupId)
      .map((group) => {
        if (group.parentGroupId !== groupId) {
          return group;
        }
        const promoted = { ...group };
        delete promoted.parentGroupId;
        if (removed.parentGroupId) {
          promoted.parentGroupId = removed.parentGroupId;
        }
        return promoted;
      }),
  };
}

/** Unique recursive membership, used only by authoring navigation. */
export function getGroupInteractionIds(groups: readonly Group[], groupId: string): string[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const children = new Map<string, string[]>();
  for (const group of groups) {
    if (group.parentGroupId) {
      const siblings = children.get(group.parentGroupId) ?? [];
      siblings.push(group.id);
      children.set(group.parentGroupId, siblings);
    }
  }
  const pending = [groupId];
  const visited = new Set<string>();
  const interactions = new Set<string>();
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined) {
      continue;
    }
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    byId.get(id)?.interactionIds.forEach((member) => interactions.add(member));
    pending.push(...(children.get(id) ?? []));
  }
  return [...interactions];
}
