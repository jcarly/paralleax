import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Group } from '@paralleax/shared';
import { EntityNameInput } from '../../../components/EntityNameInput';
import type { GroupDropTarget } from './groupTree';

export function GroupDropZone({ target }: { target: GroupDropTarget }) {
  const { setNodeRef } = useDroppable({
    id: `${target.groupId ?? 'root'}:${target.position}`,
    data: target,
  });
  return (
    <span
      ref={setNodeRef}
      className={`group-drop-zone group-drop-${target.position === 'root' ? 'root' : 'row'}`}
      aria-hidden="true"
    />
  );
}

export function StoryGroupRow({
  group,
  depth,
  count,
  expanded,
  hasChildren,
  selected,
  editing,
  disabled,
  readOnly,
  dragging,
  drop,
  invalid,
  onToggle,
  onSelect,
  onFocus,
  onMenu,
  onRename,
  onRenameComplete,
  onKeyDown,
}: {
  group: Group;
  depth: number;
  count: number;
  expanded: boolean;
  hasChildren: boolean;
  selected: boolean;
  editing: boolean;
  disabled: boolean;
  readOnly: boolean;
  dragging: boolean;
  drop?: GroupDropTarget;
  invalid: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onFocus: () => void;
  onMenu: (position: { x: number; y: number }) => void;
  onRename: (title: string) => Promise<boolean>;
  onRenameComplete: (restoreFocus: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(group.title);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: group.id,
    disabled: disabled || readOnly || editing,
  });
  return (
    <div
      ref={setNodeRef}
      id={`story-group-${group.id}`}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
      tabIndex={selected ? 0 : -1}
      data-group-id={group.id}
      className={`story-group-row ${selected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${drop ? `drop-${drop.position}` : ''} ${invalid ? 'drop-invalid' : ''}`}
      style={{ paddingLeft: `${depth * 16}px` }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <button
        type="button"
        className="ghost story-group-toggle"
        tabIndex={-1}
        aria-label={t('editor.groups.toggle', { title: group.title })}
        aria-expanded={expanded}
        onClick={onToggle}
        disabled={!hasChildren}
      >
        <span aria-hidden="true">{hasChildren ? (expanded ? '▾' : '▸') : ''}</span>
      </button>
      <span className="story-group-folder" aria-hidden="true">
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M2 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v9H2Z" />
        </svg>
      </span>
      {editing ? (
        <EntityNameInput
          autoFocus
          aria-label={t('editor.graphSelection.groupTitle')}
          maxLength={200}
          value={draft}
          onChange={setDraft}
          onCommit={onRename}
          onComplete={onRenameComplete}
          onFocus={(event) => event.target.select()}
        />
      ) : (
        <button
          {...listeners}
          type="button"
          className="ghost story-group-name"
          tabIndex={-1}
          aria-label={`${group.title} ${t('editor.groups.count', { count })}`}
          aria-pressed={selected}
          onClick={onSelect}
          onDoubleClick={onFocus}
          title={group.title}
        >
          <strong>{group.title}</strong>
        </button>
      )}
      <small className="story-group-count" aria-hidden="true">
        {count}
      </small>
      <button
        type="button"
        className="ghost story-group-actions"
        aria-label={t('editor.groups.actions', { title: group.title })}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onMenu({ x: bounds.left, y: bounds.bottom });
        }}
      >
        ⋯
      </button>
      {dragging ? (
        <div className="group-drop-zones">
          <GroupDropZone target={{ groupId: group.id, position: 'inside' }} />
        </div>
      ) : null}
    </div>
  );
}
