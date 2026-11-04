import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { Group } from '@paralleax/shared';
import {
  getVisibleGroupExplorerEntries,
  projectGroupTree,
  type GroupExplorerEntry,
  type GroupTreeProjection,
} from './groupTree';
import {
  handleGroupTreeKeyDown,
  handleInteractionTreeKeyDown,
  type GroupMoveDirection,
  type GroupTreeKeyboardContext,
} from './groupTreeKeyboard';
import type { StoryGroupsPanelProps } from './storyGroupTypes';

interface GroupTreeMenu {
  groupId: string;
  position: { x: number; y: number };
}

export function useGroupTreeNavigation(
  props: StoryGroupsPanelProps,
  panel: RefObject<HTMLElement | null>,
) {
  const expansion = useGroupTreeExpansion(props.searchQuery);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const projection = useGroupTreeProjection({
    props,
    expandedIds,
    collapsedSearchIds: expansion.collapsedIds,
  });
  const focus = useGroupTreeFocus(props, panel);
  const [menu, setMenu] = useState<GroupTreeMenu | undefined>(undefined);
  const { toggle, isExpanded } = useGroupTreeControls({
    searchQuery: props.searchQuery,
    expansion,
    projection,
    expandedIds,
    setExpandedIds,
  });
  return {
    ...projection,
    ...focus,
    expandedIds,
    setExpandedIds,
    toggle,
    isExpanded,
    menu,
    setMenu,
    createGroupKeyDown: (moveGroup: GroupTreeKeyboardContext['moveGroup']) =>
      createGroupKeyDownHandler({
        props,
        projection,
        focus,
        isExpanded,
        toggle,
        setMenu,
        moveGroup,
      }),
    interactionKeyDown: createInteractionKeyDownHandler(projection, focus),
  };
}

function useGroupTreeControls({
  searchQuery,
  expansion,
  projection,
  expandedIds,
  setExpandedIds,
}: {
  searchQuery: string;
  expansion: ReturnType<typeof useGroupTreeExpansion>;
  projection: ReturnType<typeof useGroupTreeProjection>;
  expandedIds: ReadonlySet<string>;
  setExpandedIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const { toggle: toggleExpansion, collapsedIds } = expansion;
  const { tree, forcedOpenIds } = projection;
  const toggle = useCallback(
    (groupId: string) => {
      toggleExpansion(groupId, tree, searchQuery, setExpandedIds);
    },
    [toggleExpansion, tree, searchQuery, setExpandedIds],
  );
  const isExpanded = useCallback(
    (groupId: string) =>
      expandedIds.has(groupId) ||
      forcedOpenIds.has(groupId) ||
      (tree.expandedMatches.has(groupId) && !collapsedIds.has(groupId)),
    [expandedIds, forcedOpenIds, tree.expandedMatches, collapsedIds],
  );
  return { toggle, isExpanded };
}

function useGroupTreeProjection({
  props,
  expandedIds,
  collapsedSearchIds,
}: {
  props: StoryGroupsPanelProps;
  expandedIds: ReadonlySet<string>;
  collapsedSearchIds: ReadonlySet<string>;
}) {
  const core = useGroupTreeCore(props);
  const entries = useGroupTreeEntries({ props, core, expandedIds, collapsedSearchIds });
  const ungroupedMatchCount = core.ungroupedInteractions.filter(({ id }) =>
    core.matchingInteractionIds.has(id),
  ).length;
  return {
    ...core,
    entries,
    ungroupedMatchCount,
    open: props.open || Boolean(props.editingGroupId),
  };
}

interface GroupTreeCore {
  groups: Group[];
  matchingInteractionIds: ReadonlySet<string>;
  liveInteractionIds: ReadonlySet<string>;
  tree: GroupTreeProjection;
  forcedOpenIds: ReadonlySet<string>;
  forcedVisibleIds: ReadonlySet<string>;
  ungroupedInteractions: StoryGroupsPanelProps['story']['interactions'];
}

function useGroupTreeCore(props: StoryGroupsPanelProps): GroupTreeCore {
  const groups = useMemo(() => props.story.groups ?? [], [props.story.groups]);
  const matchingInteractionIds = useMemo(
    () => new Set(props.matchingInteractionIds),
    [props.matchingInteractionIds],
  );
  const liveInteractionIds = useMemo(
    () => new Set(props.story.interactions.map(({ id }) => id)),
    [props.story.interactions],
  );
  const tree = useMemo(
    () => projectGroupTree(groups, liveInteractionIds, props.searchQuery, matchingInteractionIds),
    [groups, liveInteractionIds, matchingInteractionIds, props.searchQuery],
  );
  const forcedOpenIds = useMemo(
    () => getGroupAncestorIds(props.editingGroupId, tree),
    [props.editingGroupId, tree],
  );
  const forcedVisibleIds = useMemo(
    () => new Set(props.editingGroupId ? [props.editingGroupId] : []),
    [props.editingGroupId],
  );
  const ungroupedInteractions = useUngroupedInteractions(props.story.interactions, groups);
  return {
    groups,
    matchingInteractionIds,
    liveInteractionIds,
    tree,
    forcedOpenIds,
    forcedVisibleIds,
    ungroupedInteractions,
  };
}

function useGroupTreeEntries({
  props,
  core,
  expandedIds,
  collapsedSearchIds,
}: {
  props: StoryGroupsPanelProps;
  core: GroupTreeCore;
  expandedIds: ReadonlySet<string>;
  collapsedSearchIds: ReadonlySet<string>;
}) {
  return useMemo(
    () =>
      getVisibleGroupExplorerEntries({
        story: props.story,
        tree: core.tree,
        matchingInteractionIds: core.matchingInteractionIds,
        expandedIds,
        forcedOpenIds: core.forcedOpenIds,
        collapsedSearchIds,
        forcedVisibleIds: core.forcedVisibleIds,
      }),
    [
      collapsedSearchIds,
      core.forcedOpenIds,
      core.forcedVisibleIds,
      core.matchingInteractionIds,
      core.tree,
      expandedIds,
      props.story,
    ],
  );
}

function useGroupTreeExpansion(searchQuery: string) {
  const [collapsedSearchExpansion, setCollapsedSearchExpansion] = useState<{
    query: string;
    ids: ReadonlySet<string>;
  }>({ query: '', ids: new Set() });
  const collapsedIds = useMemo(
    () =>
      collapsedSearchExpansion.query === searchQuery
        ? collapsedSearchExpansion.ids
        : new Set<string>(),
    [collapsedSearchExpansion, searchQuery],
  );
  const toggle = useCallback(
    (
      groupId: string,
      tree: GroupTreeProjection,
      query: string,
      setExpandedIds: Dispatch<SetStateAction<ReadonlySet<string>>>,
    ) => {
      if (tree.searching && tree.expandedMatches.has(groupId)) {
        setCollapsedSearchExpansion((current) =>
          toggleCollapsedSearchGroup(current, query, groupId),
        );
        return;
      }
      setExpandedIds((current) => toggleExpandedGroup(current, groupId));
    },
    [],
  );
  return { collapsedIds, toggle };
}

function toggleCollapsedSearchGroup(
  current: { query: string; ids: ReadonlySet<string> },
  query: string,
  groupId: string,
) {
  const ids = new Set(current.query === query ? current.ids : []);
  if (ids.has(groupId)) {
    ids.delete(groupId);
  } else {
    ids.add(groupId);
  }
  return { query, ids };
}

function toggleExpandedGroup(current: ReadonlySet<string>, groupId: string) {
  const next = new Set(current);
  if (next.has(groupId)) {
    next.delete(groupId);
  } else {
    next.add(groupId);
  }
  return next;
}

function useGroupTreeFocus(props: StoryGroupsPanelProps, panel: RefObject<HTMLElement | null>) {
  const restoreFocusGroupId = useRef<string | undefined>(undefined);
  const focusRow = useCallback((id?: string) => focusPanelRow(panel, id), [panel]);
  const focusEntry = useCallback(
    (entry?: GroupExplorerEntry) => focusRow(getEntryId(entry)),
    [focusRow],
  );
  useEffect(() => scrollToEditingGroup(panel, props.editingGroupId), [panel, props.editingGroupId]);
  useLayoutEffect(() => {
    if (!restoreFocusGroupId.current || props.editingGroupId) {
      return;
    }
    const groupId = restoreFocusGroupId.current;
    restoreFocusGroupId.current = undefined;
    focusRow(groupId);
  }, [focusRow, props.editingGroupId]);
  return { focusRow, focusEntry, restoreFocusGroupId };
}

function focusPanelRow(panel: RefObject<HTMLElement | null>, id?: string) {
  if (!id) {
    return;
  }
  const row =
    document.getElementById(`story-group-${id}`) ??
    document.getElementById(`story-interaction-${id}`);
  if (row && panel.current?.contains(row)) {
    row.focus();
  }
}

function getEntryId(entry?: GroupExplorerEntry) {
  if (!entry) {
    return undefined;
  }
  return entry.type === 'group' ? entry.group.id : entry.interaction.id;
}

function scrollToEditingGroup(panel: RefObject<HTMLElement | null>, editingGroupId?: string) {
  if (!editingGroupId) {
    return;
  }
  const rows = panel.current?.querySelectorAll<HTMLElement>('[data-group-id]') ?? [];
  [...rows]
    .find((row) => row.dataset.groupId === editingGroupId)
    ?.scrollIntoView?.({
      block: 'nearest',
    });
}

function createGroupKeyDownHandler({
  props,
  projection,
  focus,
  isExpanded,
  toggle,
  setMenu,
  moveGroup,
}: {
  props: StoryGroupsPanelProps;
  projection: ReturnType<typeof useGroupTreeProjection>;
  focus: ReturnType<typeof useGroupTreeFocus>;
  isExpanded: (groupId: string) => boolean;
  toggle: (groupId: string) => void;
  setMenu: Dispatch<SetStateAction<GroupTreeMenu | undefined>>;
  moveGroup: (group: Group, direction: GroupMoveDirection) => void;
}) {
  return (event: React.KeyboardEvent<HTMLDivElement>, group: Group) => {
    const context: GroupTreeKeyboardContext = {
      entries: projection.entries,
      tree: projection.tree,
      readOnly: props.readOnly,
      isExpanded,
      toggle,
      focusRow: focus.focusRow,
      focusEntry: focus.focusEntry,
      selectGroup: props.onSelect,
      renameGroup: props.onEditingChange,
      openMenu: (groupId, position) => setMenu({ groupId, position }),
      moveGroup,
    };
    handleGroupTreeKeyDown(event, group, context);
  };
}

function createInteractionKeyDownHandler(
  projection: ReturnType<typeof useGroupTreeProjection>,
  focus: ReturnType<typeof useGroupTreeFocus>,
) {
  return (event: React.KeyboardEvent<HTMLButtonElement>, interactionId: string) =>
    handleInteractionTreeKeyDown(event, interactionId, {
      entries: projection.entries,
      tree: projection.tree,
      focusRow: focus.focusRow,
      focusEntry: focus.focusEntry,
    });
}

function useUngroupedInteractions(
  interactions: StoryGroupsPanelProps['story']['interactions'],
  groups: readonly Group[],
) {
  const groupedInteractionIds = useMemo(
    () => new Set(groups.flatMap(({ interactionIds }) => interactionIds)),
    [groups],
  );
  return useMemo(
    () => interactions.filter(({ id }) => !groupedInteractionIds.has(id)),
    [groupedInteractionIds, interactions],
  );
}

function getGroupAncestorIds(groupId: string | undefined, tree: GroupTreeProjection) {
  const result = new Set<string>();
  let group = tree.byId.get(groupId ?? '');
  while (group?.parentGroupId && !result.has(group.parentGroupId)) {
    result.add(group.parentGroupId);
    group = tree.byId.get(group.parentGroupId);
  }
  return result;
}
