import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Group, UpdateGroupInput } from '@paralleax/shared';
import { getGroupDropInput, type GroupDropTarget } from './groupTree';

interface GroupTreeDragOptions {
  groups: readonly Group[];
  panel: RefObject<HTMLElement | null>;
  updateGroup: (groupId: string, input: UpdateGroupInput) => Promise<boolean>;
  mutate: (action: () => Promise<unknown>) => Promise<boolean>;
  expandGroup: (groupId: string) => void;
  closeMenu: () => void;
}

export function useGroupTreeDrag(options: GroupTreeDragOptions) {
  const { groups, expandGroup } = options;
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<GroupDropTarget | undefined>(undefined);
  const targetRef = useRef<GroupDropTarget | undefined>(undefined);
  const pointer = useGroupPointerPosition();
  const sensors = useGroupTreeSensors();
  const handlers = useGroupTreeDragHandlers({
    options,
    targetRef,
    setActiveId,
    setTarget,
    pointerY: pointer.pointerY,
    pointerPosition: pointer.pointerPosition,
  });
  useGroupDragExpansion(activeId, target, groups, expandGroup);
  return {
    activeId,
    target,
    sensors,
    ...handlers,
    pointerHandlers: pointer.handlers,
  };
}

function useGroupTreeSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
}

function useGroupTreeDragHandlers({
  options,
  targetRef,
  setActiveId,
  setTarget,
  pointerY,
  pointerPosition,
}: DragHandlersOptions) {
  const { groups, panel, updateGroup, mutate, closeMenu } = options;
  const resolveTarget = useCallback(
    (event: DragOverEvent | DragEndEvent) => getDropTarget(event, pointerY.current),
    [pointerY],
  );
  const onDragStart = useDragStart({ closeMenu, setActiveId, setTarget, targetRef });
  const onDragOver = useDragOver({ resolveTarget, targetRef, setTarget });
  const onDragEnd = useDragEnd({
    groups,
    panel,
    updateGroup,
    mutate,
    resolveTarget,
    targetRef,
    setActiveId,
    setTarget,
    pointerPosition,
  });
  const onDragCancel = useDragCancel({ setActiveId, setTarget, targetRef });
  return { onDragStart, onDragMove: onDragOver, onDragOver, onDragEnd, onDragCancel };
}

interface DragHandlersOptions {
  options: GroupTreeDragOptions;
  targetRef: MutableRefObject<GroupDropTarget | undefined>;
  setActiveId: Dispatch<SetStateAction<string | undefined>>;
  setTarget: Dispatch<SetStateAction<GroupDropTarget | undefined>>;
  pointerY: MutableRefObject<number>;
  pointerPosition: MutableRefObject<{ x: number; y: number } | undefined>;
}

function useDragStart({
  closeMenu,
  setActiveId,
  setTarget,
  targetRef,
}: {
  closeMenu: () => void;
  setActiveId: Dispatch<SetStateAction<string | undefined>>;
  setTarget: Dispatch<SetStateAction<GroupDropTarget | undefined>>;
  targetRef: MutableRefObject<GroupDropTarget | undefined>;
}) {
  return useCallback(
    (event: DragStartEvent) => {
      setActiveId(String(event.active.id));
      targetRef.current = undefined;
      setTarget(undefined);
      closeMenu();
    },
    [closeMenu, setActiveId, setTarget, targetRef],
  );
}

function useDragOver({
  resolveTarget,
  targetRef,
  setTarget,
}: {
  resolveTarget: (event: DragOverEvent | DragEndEvent) => GroupDropTarget | undefined;
  targetRef: MutableRefObject<GroupDropTarget | undefined>;
  setTarget: Dispatch<SetStateAction<GroupDropTarget | undefined>>;
}) {
  return useCallback(
    (event: DragOverEvent) => {
      const next = resolveTarget(event);
      if (next) {
        targetRef.current = next;
      }
      setTarget(next);
    },
    [resolveTarget, setTarget, targetRef],
  );
}

function useDragEnd({
  groups,
  panel,
  updateGroup,
  mutate,
  resolveTarget,
  targetRef,
  setActiveId,
  setTarget,
  pointerPosition,
}: {
  groups: readonly Group[];
  panel: RefObject<HTMLElement | null>;
  updateGroup: GroupTreeDragOptions['updateGroup'];
  mutate: GroupTreeDragOptions['mutate'];
  resolveTarget: (event: DragOverEvent | DragEndEvent) => GroupDropTarget | undefined;
  targetRef: MutableRefObject<GroupDropTarget | undefined>;
  setActiveId: Dispatch<SetStateAction<string | undefined>>;
  setTarget: Dispatch<SetStateAction<GroupDropTarget | undefined>>;
  pointerPosition: MutableRefObject<{ x: number; y: number } | undefined>;
}) {
  return (event: DragEndEvent) => {
    finishGroupDrag({
      event,
      previousTarget: targetRef.current,
      pointer: pointerPosition.current,
      groups,
      panel,
      updateGroup,
      mutate,
      resolveTarget,
    });
    setActiveId(undefined);
    setTarget(undefined);
    targetRef.current = undefined;
  };
}

function useDragCancel({
  setActiveId,
  setTarget,
  targetRef,
}: {
  setActiveId: Dispatch<SetStateAction<string | undefined>>;
  setTarget: Dispatch<SetStateAction<GroupDropTarget | undefined>>;
  targetRef: MutableRefObject<GroupDropTarget | undefined>;
}) {
  return useCallback(() => {
    setActiveId(undefined);
    setTarget(undefined);
    targetRef.current = undefined;
  }, [setActiveId, setTarget, targetRef]);
}

function getDropTarget(event: DragOverEvent | DragEndEvent, pointerY: number) {
  const target = parseDropTarget(event.over?.data.current);
  if (!target || !event.over || target.position === 'root') {
    return target;
  }
  const fraction = (pointerY - event.over.rect.top) / event.over.rect.height;
  return {
    groupId: target.groupId,
    position: fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside',
  } satisfies GroupDropTarget;
}

function parseDropTarget(value: unknown): GroupDropTarget | undefined {
  if (!isRecord(value) || !isDropPosition(value.position)) {
    return undefined;
  }
  if (value.groupId !== undefined && typeof value.groupId !== 'string') {
    return undefined;
  }
  return {
    position: value.position,
    ...(typeof value.groupId === 'string' ? { groupId: value.groupId } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDropPosition(value: unknown): value is GroupDropTarget['position'] {
  return value === 'before' || value === 'inside' || value === 'after' || value === 'root';
}

function finishGroupDrag({
  event,
  previousTarget,
  pointer,
  groups,
  panel,
  updateGroup,
  mutate,
  resolveTarget,
}: {
  event: DragEndEvent;
  previousTarget: GroupDropTarget | undefined;
  pointer: { x: number; y: number } | undefined;
  groups: readonly Group[];
  panel: RefObject<HTMLElement | null>;
  updateGroup: GroupTreeDragOptions['updateGroup'];
  mutate: GroupTreeDragOptions['mutate'];
  resolveTarget: (event: DragOverEvent | DragEndEvent) => GroupDropTarget | undefined;
}) {
  const destination =
    resolveTarget(event) ??
    (previousTarget && getTargetAtPointer(previousTarget, pointer, panel.current));
  const input = destination && getGroupDropInput(groups, String(event.active.id), destination);
  if (input) {
    void mutate(() => updateGroup(String(event.active.id), input));
  }
}

function getTargetAtPointer(
  target: GroupDropTarget,
  pointer: { x: number; y: number } | undefined,
  panel: HTMLElement | null,
) {
  const element = getDropTargetElement(target, panel);
  const bounds = element?.getBoundingClientRect();
  if (!pointer || !bounds || !isPointInsideBounds(pointer, bounds)) {
    return undefined;
  }
  if (target.position === 'root') {
    return target;
  }
  return getGroupDropTargetAtPoint(target, pointer, bounds);
}

function getGroupDropTargetAtPoint(
  target: GroupDropTarget,
  pointer: { x: number; y: number },
  bounds: DOMRect,
) {
  const fraction = (pointer.y - bounds.top) / bounds.height;
  return {
    groupId: target.groupId,
    position: fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside',
  } satisfies GroupDropTarget;
}

function getDropTargetElement(target: GroupDropTarget, panel: HTMLElement | null) {
  if (target.position === 'root') {
    return panel?.querySelector<HTMLElement>('.story-group-root-drop');
  }
  return document.getElementById(`story-group-${target.groupId}`);
}

function isPointInsideBounds(point: { x: number; y: number }, bounds: DOMRect) {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function useGroupDragExpansion(
  activeId: string | undefined,
  target: GroupDropTarget | undefined,
  groups: readonly Group[],
  expandGroup: (groupId: string) => void,
) {
  useEffect(() => {
    if (!canExpandDropTarget(activeId, target, groups)) {
      return;
    }
    const groupId = target?.groupId;
    if (!groupId) {
      return;
    }
    const timer = window.setTimeout(() => expandGroup(groupId), 650);
    return () => window.clearTimeout(timer);
  }, [activeId, expandGroup, groups, target]);
}

function canExpandDropTarget(
  activeId: string | undefined,
  target: GroupDropTarget | undefined,
  groups: readonly Group[],
) {
  return Boolean(
    activeId &&
    target?.position === 'inside' &&
    target.groupId &&
    getGroupDropInput(groups, activeId, target),
  );
}

function useGroupPointerPosition() {
  const pointerY = useRef(0);
  const pointerPosition = useRef<{ x: number; y: number } | undefined>(undefined);
  const onPointerMoveCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    pointerY.current = event.clientY;
    pointerPosition.current = { x: event.clientX, y: event.clientY };
  }, []);
  const onTouchMoveCapture = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    pointerY.current = touch.clientY;
    pointerPosition.current = { x: touch.clientX, y: touch.clientY };
  }, []);
  return {
    pointerY,
    pointerPosition,
    handlers: { onPointerMoveCapture, onTouchMoveCapture },
  };
}
