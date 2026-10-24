import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import {
  getGroupInteractionIds,
  type Group,
  type Story,
  type UpdateGroupInput,
} from '@paralleax/shared';
import { ContextMenu, ContextMenuAction } from '../../../components/ContextMenu';
import { getGroupDropInput, projectGroupTree, type GroupDropTarget } from './groupTree';
import { GroupDropZone, StoryGroupRow } from './StoryGroupRow';

export interface StoryGroupsPanelProps {
  story: Story;
  selectedGroupId?: string;
  editingGroupId?: string;
  selectionIds: string[];
  readOnly: boolean;
  onSelect: (groupId: string) => void;
  onFocus: (interactionIds: string[]) => void;
  onSelectInteractions: (interactionIds: string[]) => void;
  onEditingChange: (groupId?: string) => void;
  onCreate: (
    title: string,
    interactionIds: string[],
    parentGroupId?: string,
  ) => Promise<string | false>;
  onUpdate: (groupId: string, input: UpdateGroupInput) => Promise<boolean>;
  onDelete: (groupId: string) => Promise<boolean>;
}

export function StoryGroupTreePanel(props: StoryGroupsPanelProps) {
  const { t } = useTranslation();
  const [collapsedAtCount, setCollapsedAtCount] = useState<number>();
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState('');
  const [menu, setMenu] = useState<{ groupId: string; position: { x: number; y: number } }>();
  const [activeId, setActiveId] = useState<string>();
  const [target, setTarget] = useState<GroupDropTarget>();
  const panel = useRef<HTMLElement>(null);
  const restoreFocusGroupId = useRef<string | undefined>(undefined);
  const pointerY = useRef(0);
  const groups = useMemo(() => props.story.groups ?? [], [props.story.groups]);
  const open = collapsedAtCount !== groups.length || Boolean(props.editingGroupId);
  const focusRow = useCallback((id?: string) => {
    if (!id) return;
    const row = document.getElementById(`story-group-${id}`);
    if (row && panel.current?.contains(row)) row.focus();
  }, []);
  const tree = useMemo(
    () => projectGroupTree(groups, new Set(props.story.interactions.map(({ id }) => id)), query),
    [groups, props.story.interactions, query],
  );
  const forcedOpen = new Set<string>();
  let ancestor = tree.byId.get(props.editingGroupId ?? '');
  while (ancestor?.parentGroupId && !forcedOpen.has(ancestor.parentGroupId)) {
    forcedOpen.add(ancestor.parentGroupId);
    ancestor = tree.byId.get(ancestor.parentGroupId);
  }
  const visible: { group: Group; depth: number }[] = [];
  const pending = (tree.children.get(undefined) ?? [])
    .map((group) => ({ group, depth: 0 }))
    .reverse();
  while (pending.length) {
    const entry = pending.pop()!;
    if (
      tree.searching &&
      !tree.matches.has(entry.group.id) &&
      entry.group.id !== props.editingGroupId &&
      !forcedOpen.has(entry.group.id)
    )
      continue;
    visible.push(entry);
    if (tree.searching || expandedIds.has(entry.group.id) || forcedOpen.has(entry.group.id)) {
      pending.push(
        ...(tree.children.get(entry.group.id) ?? [])
          .map((group) => ({ group, depth: entry.depth + 1 }))
          .reverse(),
      );
    }
  }
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  useEffect(() => {
    if (
      !activeId ||
      target?.position !== 'inside' ||
      !target.groupId ||
      !getGroupDropInput(groups, activeId, target)
    )
      return;
    const id = target.groupId;
    const timer = window.setTimeout(
      () => setExpandedIds((current) => new Set([...current, id])),
      650,
    );
    return () => window.clearTimeout(timer);
  }, [activeId, target, groups]);
  useEffect(() => {
    if (!props.editingGroupId) return;
    [...(panel.current?.querySelectorAll<HTMLElement>('[data-group-id]') ?? [])]
      .find((row) => row.dataset.groupId === props.editingGroupId)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [props.editingGroupId]);
  useLayoutEffect(() => {
    const groupId = restoreFocusGroupId.current;
    if (!groupId || props.editingGroupId) return;
    restoreFocusGroupId.current = undefined;
    focusRow(groupId);
  }, [focusRow, props.editingGroupId]);

  async function mutate(action: () => Promise<unknown>) {
    if (locked.current || props.readOnly) return false;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = Boolean(await action());
      setMessage(t(result ? 'editor.groups.saved' : 'editor.groups.failed'));
      return result;
    } catch {
      setMessage(t('editor.groups.failed'));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function ids(groupId: string) {
    return getGroupInteractionIds(groups, groupId).filter((id) =>
      props.story.interactions.some((interaction) => interaction.id === id),
    );
  }
  function toggle(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function move(group: Group, direction: 'up' | 'down' | 'in' | 'out') {
    const siblings = tree.children.get(group.parentGroupId) ?? [];
    const index = siblings.indexOf(group);
    let input: UpdateGroupInput | undefined;
    if (direction === 'up' && index > 0)
      input = { parentGroupId: group.parentGroupId ?? null, beforeGroupId: siblings[index - 1].id };
    if (direction === 'down' && index < siblings.length - 1)
      input = {
        parentGroupId: group.parentGroupId ?? null,
        beforeGroupId: siblings[index + 2]?.id ?? null,
      };
    if (direction === 'in' && index > 0) {
      input = { parentGroupId: siblings[index - 1].id, beforeGroupId: null };
      setExpandedIds((current) => new Set([...current, siblings[index - 1].id]));
    }
    if (direction === 'out' && group.parentGroupId) {
      const parent = tree.byId.get(group.parentGroupId)!;
      const uncles = tree.children.get(parent.parentGroupId) ?? [];
      input = {
        parentGroupId: parent.parentGroupId ?? null,
        beforeGroupId: uncles[uncles.indexOf(parent) + 1]?.id ?? null,
      };
    }
    if (input) void mutate(() => props.onUpdate(group.id, input)).then(() => focusRow(group.id));
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>, group: Group) {
    if ((event.target as HTMLElement).closest('input')) return;
    const index = visible.findIndex((entry) => entry.group.id === group.id);
    if ((event.ctrlKey || event.metaKey) && !props.readOnly) {
      const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowRight: 'in', ArrowLeft: 'out' }[
        event.key
      ] as 'up' | 'down' | 'in' | 'out' | undefined;
      if (direction) {
        event.preventDefault();
        event.stopPropagation();
        move(group, direction);
        return;
      }
    }
    if (event.key === 'F2' && !props.readOnly) {
      event.preventDefault();
      props.onEditingChange(group.id);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      setMenu({ groupId: group.id, position: { x: bounds.left, y: bounds.bottom } });
    } else if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Home' ||
      event.key === 'End'
    ) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? visible.length - 1
            : Math.max(
                0,
                Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
              );
      focusRow(visible[next]?.group.id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (!expandedIds.has(group.id)) toggle(group.id);
      else focusRow(tree.children.get(group.id)?.[0]?.id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (expandedIds.has(group.id)) toggle(group.id);
      else focusRow(group.parentGroupId);
    } else if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      props.onSelect(group.id);
    }
  }
  function dropTarget(event: DragOverEvent | DragEndEvent): GroupDropTarget | undefined {
    const data = event.over?.data.current as GroupDropTarget | undefined;
    if (!data || !event.over || data.position === 'root') return data;
    const fraction = (pointerY.current - event.over.rect.top) / event.over.rect.height;
    return {
      groupId: data.groupId,
      position: fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside',
    };
  }
  function dragOver(event: DragOverEvent) {
    const next = dropTarget(event);
    setTarget((previous) =>
      previous?.groupId === next?.groupId && previous?.position === next?.position
        ? previous
        : next,
    );
  }
  function dragEnd(event: DragEndEvent) {
    const destination = dropTarget(event);
    const input = destination && getGroupDropInput(groups, String(event.active.id), destination);
    setActiveId(undefined);
    setTarget(undefined);
    if (input) void mutate(() => props.onUpdate(String(event.active.id), input));
  }
  const menuGroup = tree.byId.get(menu?.groupId ?? '');

  return (
    <section
      ref={panel}
      className="story-groups-panel"
      aria-label={t('editor.groups.title')}
      onPointerMoveCapture={(event) => {
        pointerY.current = event.clientY;
      }}
      onTouchMoveCapture={(event) => {
        if (event.touches[0]) pointerY.current = event.touches[0].clientY;
      }}
    >
      <div className="editor-context-header editor-heading-row">
        <button
          className="ghost context-heading"
          type="button"
          aria-expanded={open}
          onClick={() => setCollapsedAtCount(open ? groups.length : undefined)}
        >
          <span className="context-heading-label">
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            {t('editor.groups.title')}
          </span>
          <small>{groups.length}</small>
        </button>
      </div>
      {open ? (
        <>
          {groups.length > 0 ? (
            <input
              type="search"
              className="story-group-search"
              aria-label={t('editor.groups.search')}
              placeholder={t('editor.groups.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            autoScroll
            accessibility={{
              screenReaderInstructions: { draggable: t('editor.groups.keyboardHelp') },
              announcements: {
                onDragStart: () => t('editor.groups.dragStarted'),
                onDragOver: ({ over }) => (over ? t('editor.groups.dropPreview') : undefined),
                onDragEnd: () => t('editor.groups.dragEnded'),
                onDragCancel: () => t('editor.groups.dragCancelled'),
              },
            }}
            onDragStart={({ active }) => {
              setActiveId(String(active.id));
              setMenu(undefined);
            }}
            onDragMove={dragOver}
            onDragOver={dragOver}
            onDragEnd={dragEnd}
            onDragCancel={() => {
              setActiveId(undefined);
              setTarget(undefined);
            }}
          >
            <div
              role="tree"
              aria-label={t('editor.groups.title')}
              aria-describedby="group-keyboard-help"
              className="story-group-tree"
              tabIndex={
                visible.length && !visible.some(({ group }) => group.id === props.selectedGroupId)
                  ? 0
                  : -1
              }
              onFocus={(event) => {
                if (event.target === event.currentTarget) focusRow(visible[0]?.group.id);
              }}
            >
              {visible.map(({ group, depth }) => (
                <StoryGroupRow
                  key={`${group.id}:${props.editingGroupId === group.id}`}
                  group={group}
                  depth={depth}
                  count={tree.counts.get(group.id) ?? 0}
                  selected={props.selectedGroupId === group.id}
                  editing={props.editingGroupId === group.id}
                  expanded={tree.searching || expandedIds.has(group.id) || forcedOpen.has(group.id)}
                  hasChildren={Boolean(tree.children.get(group.id)?.length)}
                  disabled={busy}
                  readOnly={props.readOnly}
                  dragging={Boolean(activeId)}
                  drop={target?.groupId === group.id ? target : undefined}
                  invalid={Boolean(
                    activeId &&
                    target?.groupId === group.id &&
                    !getGroupDropInput(groups, activeId, target),
                  )}
                  onToggle={() => toggle(group.id)}
                  onSelect={() => {
                    props.onSelect(group.id);
                    focusRow(group.id);
                  }}
                  onFocus={() => props.onFocus(ids(group.id))}
                  onMenu={(position) => setMenu({ groupId: group.id, position })}
                  onRename={(title) => mutate(() => props.onUpdate(group.id, { title }))}
                  onRenameComplete={(restoreFocus) => {
                    if (restoreFocus) restoreFocusGroupId.current = group.id;
                    props.onEditingChange(undefined);
                  }}
                  onKeyDown={(event) => keyDown(event, group)}
                />
              ))}
            </div>
            {activeId ? (
              <div
                className={`story-group-root-drop ${target?.position === 'root' ? 'active' : ''}`}
              >
                {t('editor.groups.moveToRoot')}
                <GroupDropZone target={{ position: 'root' }} />
              </div>
            ) : null}
            {createPortal(
              <DragOverlay dropAnimation={null} style={{ pointerEvents: 'none' }}>
                {activeId ? (
                  <div className="story-group-drag-preview">{tree.byId.get(activeId)?.title}</div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
          {!visible.length ? (
            <p className="hint">
              {t(groups.length ? 'editor.groups.noMatches' : 'editor.groups.empty')}
            </p>
          ) : null}
          <p id="group-keyboard-help" className="visually-hidden">
            {t('editor.groups.keyboardHelp')}
          </p>
        </>
      ) : null}
      <p role="status" className="hint">
        {message}
      </p>
      {menu && menuGroup ? (
        <ContextMenu
          scrollable
          position={menu.position}
          label={t('editor.groups.actions', { title: menuGroup.title })}
          onClose={() => setMenu(undefined)}
        >
          {!props.readOnly ? (
            <>
              <GroupMenuAction
                label={t('editor.groups.rename')}
                onClose={() => setMenu(undefined)}
                onClick={() => props.onEditingChange(menuGroup.id)}
              />
              <GroupMenuAction
                label={t('editor.groups.createChild')}
                onClose={() => setMenu(undefined)}
                onClick={() => {
                  void mutate(() => props.onCreate(t('editor.groups.newGroup'), [], menuGroup.id));
                }}
              />
              {props.selectionIds.some((id) => !menuGroup.interactionIds.includes(id)) ? (
                <GroupMenuAction
                  label={t('editor.groups.addSelection')}
                  onClose={() => setMenu(undefined)}
                  onClick={() => {
                    void mutate(() =>
                      props.onUpdate(menuGroup.id, {
                        interactionIds: [
                          ...new Set([...menuGroup.interactionIds, ...props.selectionIds]),
                        ],
                      }),
                    );
                  }}
                />
              ) : null}
              {props.selectionIds.some((id) => menuGroup.interactionIds.includes(id)) ? (
                <GroupMenuAction
                  label={t('editor.groups.removeSelection')}
                  onClose={() => setMenu(undefined)}
                  onClick={() => {
                    void mutate(() =>
                      props.onUpdate(menuGroup.id, {
                        interactionIds: menuGroup.interactionIds.filter(
                          (id) => !props.selectionIds.includes(id),
                        ),
                      }),
                    );
                  }}
                />
              ) : null}
            </>
          ) : null}
          {ids(menuGroup.id).length ? (
            <>
              <GroupMenuAction
                label={t('editor.groups.selectInteractions')}
                onClose={() => setMenu(undefined)}
                onClick={() => props.onSelectInteractions(ids(menuGroup.id))}
              />
              <GroupMenuAction
                label={t('editor.groups.focus')}
                onClose={() => setMenu(undefined)}
                onClick={() => props.onFocus(ids(menuGroup.id))}
              />
            </>
          ) : null}
          {!props.readOnly ? (
            <>
              {(tree.children.get(menuGroup.parentGroupId) ?? []).indexOf(menuGroup) > 0 ? (
                <>
                  <GroupMenuAction
                    label={t('editor.groups.moveUp')}
                    onClose={() => setMenu(undefined)}
                    onClick={() => move(menuGroup, 'up')}
                  />
                  <GroupMenuAction
                    label={t('editor.groups.moveIn')}
                    onClose={() => setMenu(undefined)}
                    onClick={() => move(menuGroup, 'in')}
                  />
                </>
              ) : null}
              {(tree.children.get(menuGroup.parentGroupId) ?? []).at(-1)?.id !== menuGroup.id ? (
                <GroupMenuAction
                  label={t('editor.groups.moveDown')}
                  onClose={() => setMenu(undefined)}
                  onClick={() => move(menuGroup, 'down')}
                />
              ) : null}
              {menuGroup.parentGroupId ? (
                <>
                  <GroupMenuAction
                    label={t('editor.groups.moveOut')}
                    onClose={() => setMenu(undefined)}
                    onClick={() => move(menuGroup, 'out')}
                  />
                  <GroupMenuAction
                    label={t('editor.groups.moveToRoot')}
                    onClose={() => setMenu(undefined)}
                    onClick={() => {
                      void mutate(() =>
                        props.onUpdate(menuGroup.id, {
                          parentGroupId: null,
                          beforeGroupId: null,
                        }),
                      );
                    }}
                  />
                </>
              ) : null}
              <ContextMenuAction
                label={t('editor.groups.delete')}
                danger
                onClick={() => {
                  setMenu(undefined);
                  void mutate(() => props.onDelete(menuGroup.id));
                }}
              />
            </>
          ) : null}
        </ContextMenu>
      ) : null}
    </section>
  );
}

function GroupMenuAction({
  label,
  onClose,
  onClick,
}: {
  label: string;
  onClose: () => void;
  onClick: () => void;
}) {
  return (
    <ContextMenuAction
      label={label}
      onClick={() => {
        onClose();
        onClick();
      }}
    />
  );
}
