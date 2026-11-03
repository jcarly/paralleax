import type { FocusEvent, KeyboardEvent } from 'react';
import { getGroupInteractionIds, type Group } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import type { GroupExplorerEntry, GroupDropTarget, GroupTreeProjection } from './groupTree';
import { getGroupDropInput } from './groupTree';
import { StoryGroupRow } from './StoryGroupRow';
import { StoryInteractionRow } from './StoryInteractionRow';

export interface StoryGroupTreeRowsProps {
  entries: readonly GroupExplorerEntry[];
  tree: GroupTreeProjection;
  groups: readonly Group[];
  matchingInteractionIds: ReadonlySet<string>;
  liveInteractionIds: ReadonlySet<string>;
  selectedGroupId?: string;
  selectedInteractionId?: string;
  editingGroupId?: string;
  readOnly: boolean;
  busy: boolean;
  activeId?: string;
  target?: GroupDropTarget;
  isExpanded: (groupId: string) => boolean;
  onToggle: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectInteraction: (interactionId: string) => void;
  onFocusGroup: (interactionIds: string[]) => void;
  onMenu: (groupId: string, position: { x: number; y: number }) => void;
  onRename: (groupId: string, title: string) => Promise<boolean>;
  onRenameComplete: (groupId: string, restoreFocus: boolean) => void;
  onGroupKeyDown: (event: KeyboardEvent<HTMLDivElement>, group: Group) => void;
  onInteractionKeyDown: (event: KeyboardEvent<HTMLButtonElement>, interactionId: string) => void;
  onFocusRow: (id?: string) => void;
}

export function StoryGroupTreeRows(props: StoryGroupTreeRowsProps) {
  const { t } = useTranslation();
  const selectedEntryVisible = props.entries.some((entry) => isSelected(entry, props));
  return (
    <div
      role="tree"
      aria-label={t('editor.groups.title')}
      aria-describedby="group-keyboard-help"
      className="story-group-tree"
      tabIndex={props.entries.length && !selectedEntryVisible ? 0 : -1}
      onFocus={(event) => focusFirstEntry(event, props)}
    >
      {props.entries.map((entry) => (
        <GroupExplorerEntryRow
          key={getEntryKey(entry, props.editingGroupId)}
          entry={entry}
          props={props}
        />
      ))}
    </div>
  );
}

function GroupExplorerEntryRow({
  entry,
  props,
}: {
  entry: GroupExplorerEntry;
  props: StoryGroupTreeRowsProps;
}) {
  if (entry.type === 'interaction') {
    return (
      <StoryInteractionRow
        interaction={entry.interaction}
        depth={entry.depth}
        selected={props.selectedInteractionId === entry.interaction.id}
        inTree
        onKeyDown={(event) => props.onInteractionKeyDown(event, entry.interaction.id)}
        onSelect={() => props.onSelectInteraction(entry.interaction.id)}
      />
    );
  }
  return <GroupTreeRow entry={entry} props={props} />;
}

function GroupTreeRow({
  entry,
  props,
}: {
  entry: Extract<GroupExplorerEntry, { type: 'group' }>;
  props: StoryGroupTreeRowsProps;
}) {
  const { group, depth } = entry;
  const drop = props.target?.groupId === group.id ? props.target : undefined;
  return (
    <StoryGroupRow
      group={group}
      depth={depth}
      count={props.tree.counts.get(group.id) ?? 0}
      selected={props.selectedGroupId === group.id}
      editing={props.editingGroupId === group.id}
      expanded={props.isExpanded(group.id)}
      hasChildren={hasChildren(group, props)}
      disabled={props.busy}
      readOnly={props.readOnly}
      dragging={Boolean(props.activeId)}
      drop={drop}
      invalid={isInvalidDrop(group.id, props)}
      onToggle={() => props.onToggle(group.id)}
      onSelect={() => props.onSelectGroup(group.id)}
      onFocus={() => props.onFocusGroup(getGroupMembers(group.id, props))}
      onMenu={(position) => props.onMenu(group.id, position)}
      onRename={(title) => props.onRename(group.id, title)}
      onRenameComplete={(restoreFocus) => props.onRenameComplete(group.id, restoreFocus)}
      onKeyDown={(event) => props.onGroupKeyDown(event, group)}
    />
  );
}

function hasChildren(group: Group, props: StoryGroupTreeRowsProps) {
  const childGroups = props.tree.children.get(group.id) ?? [];
  const matchingChildren = childGroups.some((child) => props.tree.matches.has(child.id));
  const interactionIds = group.interactionIds;
  const hasLiveInteractions = interactionIds.some((id) => props.liveInteractionIds.has(id));
  const hasMatchingInteractions = interactionIds.some((id) => props.matchingInteractionIds.has(id));
  return props.tree.searching
    ? matchingChildren || hasMatchingInteractions
    : childGroups.length > 0 || hasLiveInteractions;
}

function isInvalidDrop(groupId: string, props: StoryGroupTreeRowsProps) {
  if (!props.activeId || props.target?.groupId !== groupId) {
    return false;
  }
  return !getGroupDropInput(props.groups, props.activeId, props.target);
}

function getGroupMembers(groupId: string, props: StoryGroupTreeRowsProps) {
  return getGroupInteractionIds(props.groups, groupId).filter((id) =>
    props.liveInteractionIds.has(id),
  );
}

function isSelected(entry: GroupExplorerEntry, props: StoryGroupTreeRowsProps) {
  if (entry.type === 'group') {
    return entry.group.id === props.selectedGroupId;
  }
  return entry.interaction.id === props.selectedInteractionId;
}

function focusFirstEntry(event: FocusEvent<HTMLDivElement>, props: StoryGroupTreeRowsProps) {
  if (event.target === event.currentTarget) {
    props.onFocusRow(getEntryId(props.entries[0]));
  }
}

function getEntryId(entry?: GroupExplorerEntry) {
  if (!entry) {
    return undefined;
  }
  return entry.type === 'group' ? entry.group.id : entry.interaction.id;
}

function getEntryKey(entry: GroupExplorerEntry, editingGroupId?: string) {
  if (entry.type === 'interaction') {
    return entry.interaction.id;
  }
  return `${entry.group.id}:${editingGroupId === entry.group.id}`;
}
