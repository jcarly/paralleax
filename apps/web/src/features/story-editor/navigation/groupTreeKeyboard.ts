import type { KeyboardEvent } from 'react';
import type { Group } from '@paralleax/shared';
import type { GroupExplorerEntry, GroupTreeProjection } from './groupTree';

export interface GroupTreeKeyboardContext {
  entries: readonly GroupExplorerEntry[];
  tree: GroupTreeProjection;
  readOnly: boolean;
  isExpanded: (groupId: string) => boolean;
  toggle: (groupId: string) => void;
  focusRow: (id?: string) => void;
  focusEntry: (entry?: GroupExplorerEntry) => void;
  selectGroup: (groupId: string) => void;
  renameGroup: (groupId: string) => void;
  openMenu: (groupId: string, position: { x: number; y: number }) => void;
  moveGroup: (group: Group, direction: GroupMoveDirection) => void;
}

export type GroupMoveDirection = 'up' | 'down' | 'in' | 'out';

type GroupKeyHandler = (
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) => void;

const groupKeyHandlers: Partial<Record<string, GroupKeyHandler>> = {
  F2: renameWithKeyboard,
  ContextMenu: openMenuWithKeyboard,
  F10: openMenuWithShiftF10,
  ArrowDown: focusAdjacentGroup,
  ArrowUp: focusAdjacentGroup,
  Home: focusAdjacentGroup,
  End: focusAdjacentGroup,
  ArrowRight: expandOrEnterGroup,
  ArrowLeft: collapseOrFocusParent,
  Enter: selectGroupWithKeyboard,
  ' ': selectGroupWithKeyboard,
};

export function handleGroupTreeKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  if (event.target instanceof HTMLElement && event.target.closest('input')) {
    return;
  }
  if (handleMoveShortcut(event, group, context)) {
    return;
  }
  handleGroupKey(event, group, context);
}

function handleMoveShortcut(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  if (!(event.ctrlKey || event.metaKey) || context.readOnly) {
    return false;
  }
  const directions: Record<string, GroupMoveDirection> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowRight: 'in',
    ArrowLeft: 'out',
  };
  const direction = directions[event.key];
  if (!direction) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  context.moveGroup(group, direction);
  return true;
}

function handleGroupKey(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  groupKeyHandlers[event.key]?.(event, group, context);
}

function openMenuWithShiftF10(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  if (event.shiftKey) {
    openMenuWithKeyboard(event, group, context);
  }
}

function focusAdjacentGroup(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  focusAdjacentEntry(event, group.id, context);
}

function renameWithKeyboard(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  if (context.readOnly) {
    return;
  }
  event.preventDefault();
  context.renameGroup(group.id);
}

function openMenuWithKeyboard(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  context.openMenu(group.id, { x: bounds.left, y: bounds.bottom });
}

function focusAdjacentEntry(
  event: KeyboardEvent<HTMLDivElement>,
  groupId: string,
  context: GroupTreeKeyboardContext,
) {
  event.preventDefault();
  const currentIndex = context.entries.findIndex(
    (entry) => entry.type === 'group' && entry.group.id === groupId,
  );
  const nextIndex = getAdjacentEntryIndex(event.key, currentIndex, context.entries.length);
  context.focusEntry(context.entries[nextIndex]);
}

function getAdjacentEntryIndex(key: string, index: number, length: number) {
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return length - 1;
  }
  return Math.max(0, Math.min(length - 1, index + (key === 'ArrowDown' ? 1 : -1)));
}

function expandOrEnterGroup(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  event.preventDefault();
  if (!context.isExpanded(group.id)) {
    context.toggle(group.id);
    return;
  }
  const depth = getGroupDepth(group.id, context.entries);
  const nextChild = context.entries
    .slice(getGroupIndex(group.id, context.entries) + 1)
    .find((entry) => entry.depth > depth);
  context.focusEntry(nextChild);
}

function collapseOrFocusParent(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  event.preventDefault();
  if (context.isExpanded(group.id)) {
    context.toggle(group.id);
  } else {
    context.focusRow(group.parentGroupId);
  }
}

function selectGroupWithKeyboard(
  event: KeyboardEvent<HTMLDivElement>,
  group: Group,
  context: GroupTreeKeyboardContext,
) {
  if (event.target !== event.currentTarget) {
    return;
  }
  event.preventDefault();
  context.selectGroup(group.id);
}

export function handleInteractionTreeKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  interactionId: string,
  context: Pick<GroupTreeKeyboardContext, 'entries' | 'tree' | 'focusRow' | 'focusEntry'>,
) {
  if (isVerticalNavigationKey(event.key)) {
    focusAdjacentInteraction(event, interactionId, context);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    context.focusRow(context.tree.directGroupByInteractionId.get(interactionId));
  }
}

function isVerticalNavigationKey(key: string) {
  return ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key);
}

function focusAdjacentInteraction(
  event: KeyboardEvent<HTMLButtonElement>,
  interactionId: string,
  context: Pick<GroupTreeKeyboardContext, 'entries' | 'focusEntry'>,
) {
  event.preventDefault();
  const index = context.entries.findIndex(
    (entry) => entry.type === 'interaction' && entry.interaction.id === interactionId,
  );
  const nextIndex = getAdjacentEntryIndex(event.key, index, context.entries.length);
  context.focusEntry(context.entries[nextIndex]);
}

function getGroupIndex(groupId: string, entries: readonly GroupExplorerEntry[]) {
  return entries.findIndex((entry) => entry.type === 'group' && entry.group.id === groupId);
}

function getGroupDepth(groupId: string, entries: readonly GroupExplorerEntry[]) {
  return entries.find((entry) => entry.type === 'group' && entry.group.id === groupId)?.depth ?? -1;
}
