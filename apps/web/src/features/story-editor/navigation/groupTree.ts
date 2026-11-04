import {
  getGroupDescendantIds,
  type Group,
  type Interaction,
  type Story,
  type UpdateGroupInput,
} from '@paralleax/shared';

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
  if (!groups.some(({ id }) => id === sourceId)) {
    return undefined;
  }
  if (target.position === 'root') {
    return { parentGroupId: null, beforeGroupId: null };
  }
  const group = groups.find(({ id }) => id === target.groupId);
  if (!group || getGroupDescendantIds(groups, sourceId).has(group.id)) {
    return undefined;
  }
  if (target.position === 'inside') {
    return { parentGroupId: group.id, beforeGroupId: null };
  }
  const siblings = groups.filter(
    (candidate) => candidate.parentGroupId === group.parentGroupId && candidate.id !== sourceId,
  );
  const nextSibling = siblings[siblings.indexOf(group) + 1];
  return {
    parentGroupId: group.parentGroupId ?? null,
    beforeGroupId: target.position === 'before' ? group.id : (nextSibling?.id ?? null),
  };
}

export interface GroupTreeProjection {
  byId: ReadonlyMap<string, Group>;
  children: ReadonlyMap<string | undefined, Group[]>;
  counts: ReadonlyMap<string, number>;
  matches: ReadonlySet<string>;
  titleMatches: ReadonlySet<string>;
  expandedMatches: ReadonlySet<string>;
  directGroupByInteractionId: ReadonlyMap<string, string>;
  searching: boolean;
}

/** Build the searchable hierarchy and recursive member counts for the sidebar. */
export function projectGroupTree(
  groups: readonly Group[],
  liveInteractionIds: ReadonlySet<string>,
  query: string,
  matchingInteractionIds: ReadonlySet<string> = new Set(),
): GroupTreeProjection {
  const structure = buildGroupStructure(groups, liveInteractionIds);
  const counts = new Map<string, number>();
  const matches = new Set<string>();
  const titleMatches = new Set<string>();
  const expandedMatches = new Set<string>();
  const normalizedQuery = query.trim().toLocaleLowerCase();

  for (const group of groups) {
    const directCount = countLiveInteractions(group, liveInteractionIds);
    const ancestors = countGroupAndAncestors(group, structure.byId, counts, directCount);
    if (titleMatchesQuery(group, normalizedQuery)) {
      addTitleMatches({ group, ancestors, matches, titleMatches, expandedMatches });
    }
  }
  for (const interactionId of matchingInteractionIds) {
    addMemberMatches(interactionId, structure, matches, expandedMatches);
  }

  return {
    ...structure,
    counts,
    matches,
    titleMatches,
    expandedMatches,
    searching: Boolean(normalizedQuery),
  };
}

function buildGroupStructure(groups: readonly Group[], liveInteractionIds: ReadonlySet<string>) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const children = new Map<string | undefined, Group[]>();
  const directGroupByInteractionId = new Map<string, string>();
  for (const group of groups) {
    const siblings = children.get(group.parentGroupId) ?? [];
    siblings.push(group);
    children.set(group.parentGroupId, siblings);
    for (const id of group.interactionIds) {
      if (liveInteractionIds.has(id)) {
        directGroupByInteractionId.set(id, group.id);
      }
    }
  }
  return { byId, children, directGroupByInteractionId };
}

function countLiveInteractions(group: Group, liveInteractionIds: ReadonlySet<string>) {
  return group.interactionIds.filter((id) => liveInteractionIds.has(id)).length;
}

function countGroupAndAncestors(
  group: Group,
  byId: ReadonlyMap<string, Group>,
  counts: Map<string, number>,
  directCount: number,
) {
  const visited = new Set<string>();
  let current: Group | undefined = group;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    counts.set(current.id, (counts.get(current.id) ?? 0) + directCount);
    current = byId.get(current.parentGroupId ?? '');
  }
  return visited;
}

function titleMatchesQuery(group: Group, normalizedQuery: string) {
  return Boolean(normalizedQuery && group.title.toLocaleLowerCase().includes(normalizedQuery));
}

function addTitleMatches({
  group,
  ancestors,
  matches,
  titleMatches,
  expandedMatches,
}: {
  group: Group;
  ancestors: ReadonlySet<string>;
  matches: Set<string>;
  titleMatches: Set<string>;
  expandedMatches: Set<string>;
}) {
  titleMatches.add(group.id);
  for (const id of ancestors) {
    matches.add(id);
    if (id !== group.id) {
      expandedMatches.add(id);
    }
  }
}

function addMemberMatches(
  interactionId: string,
  structure: ReturnType<typeof buildGroupStructure>,
  matches: Set<string>,
  expandedMatches: Set<string>,
) {
  const group = structure.byId.get(structure.directGroupByInteractionId.get(interactionId) ?? '');
  const visited = new Set<string>();
  let current = group;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    matches.add(current.id);
    expandedMatches.add(current.id);
    current = structure.byId.get(current.parentGroupId ?? '');
  }
}

export type GroupExplorerEntry =
  | { type: 'group'; group: Group; depth: number }
  | { type: 'interaction'; interaction: Interaction; depth: number };

export interface GroupExplorerVisibilityOptions {
  story: Story;
  tree: GroupTreeProjection;
  matchingInteractionIds: ReadonlySet<string>;
  expandedIds: ReadonlySet<string>;
  forcedOpenIds?: ReadonlySet<string>;
  collapsedSearchIds?: ReadonlySet<string>;
  forcedVisibleIds?: ReadonlySet<string>;
}

interface GroupExplorerTraversal {
  options: GroupExplorerVisibilityOptions;
  interactionsById: ReadonlyMap<string, Interaction>;
  entries: GroupExplorerEntry[];
  pending: GroupExplorerEntry[];
}

/** Flatten expanded groups, keeping subgroups before direct Interactions. */
export function getVisibleGroupExplorerEntries(
  options: GroupExplorerVisibilityOptions,
): GroupExplorerEntry[] {
  const interactionsById = new Map(
    options.story.interactions.map((interaction) => [interaction.id, interaction]),
  );
  const entries: GroupExplorerEntry[] = [];
  const pending = createPendingGroups(options.tree);
  const traversal = { options, interactionsById, entries, pending };

  while (pending.length) {
    const entry = pending.pop();
    if (!entry) {
      continue;
    }
    if (entry.type === 'interaction') {
      entries.push(entry);
    } else {
      visitGroup(entry, traversal);
    }
  }
  return entries;
}

function createPendingGroups(tree: GroupTreeProjection): GroupExplorerEntry[] {
  return (tree.children.get(undefined) ?? [])
    .map((group): GroupExplorerEntry => ({ type: 'group', group, depth: 0 }))
    .reverse();
}

function visitGroup(
  entry: Extract<GroupExplorerEntry, { type: 'group' }>,
  traversal: GroupExplorerTraversal,
) {
  const { group, depth } = entry;
  const { options, entries, pending } = traversal;
  if (!isVisibleGroup(group, options)) {
    return;
  }
  entries.push(entry);
  if (!isGroupExpanded(group.id, options)) {
    return;
  }
  addDirectInteractions(group, depth, traversal);
  addSubgroups(group, depth, options.tree, pending);
}

function isVisibleGroup(group: Group, options: GroupExplorerVisibilityOptions) {
  return (
    !options.tree.searching ||
    options.tree.matches.has(group.id) ||
    options.forcedVisibleIds?.has(group.id) === true
  );
}

function isGroupExpanded(groupId: string, options: GroupExplorerVisibilityOptions) {
  return (
    options.expandedIds.has(groupId) ||
    options.forcedOpenIds?.has(groupId) === true ||
    (options.tree.expandedMatches.has(groupId) && !options.collapsedSearchIds?.has(groupId))
  );
}

function addDirectInteractions(group: Group, depth: number, traversal: GroupExplorerTraversal) {
  const { options, interactionsById, pending } = traversal;
  for (const interactionId of [...group.interactionIds].reverse()) {
    const interaction = interactionsById.get(interactionId);
    const matches = options.matchingInteractionIds.has(interactionId);
    if (interaction && (!options.tree.searching || matches)) {
      pending.push({ type: 'interaction', interaction, depth: depth + 1 });
    }
  }
}

function addSubgroups(
  group: Group,
  depth: number,
  tree: GroupTreeProjection,
  pending: GroupExplorerEntry[],
) {
  const children = tree.children.get(group.id) ?? [];
  for (const child of [...children].reverse()) {
    pending.push({ type: 'group', group: child, depth: depth + 1 });
  }
}
