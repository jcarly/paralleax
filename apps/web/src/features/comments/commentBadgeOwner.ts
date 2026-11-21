import { useSyncExternalStore } from 'react';

/**
 * Inspector comment badges share one gutter, so at most one badge is shown.
 *
 * The badge sits in the inspector gutter, away from its field, and the pointer
 * may cross other commentable fields on its way there. While the pointer moves
 * inside the corridor between the field and its badge, the badge stays, and
 * another field takes it over only once the pointer rests on that field.
 * Leaving the corridor hides the badge after a short grace period. Focus changes
 * are explicit and move the badge immediately.
 */
export const commentBadgeIntentDelayMs = 180;
export const commentBadgeHideDelayMs = 220;

export type CommentBadgeCorridor = () => DOMRect | undefined;

let owner: string | undefined;
let ownerCorridor: CommentBadgeCorridor | undefined;
let ownerHovered = false;
let pending: { id: string; corridor: CommentBadgeCorridor } | undefined;
let pendingTimer: number | undefined;
let hideTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function clearPending() {
  if (pendingTimer !== undefined) {
    window.clearTimeout(pendingTimer);
    pendingTimer = undefined;
  }
  pending = undefined;
}

function clearHide() {
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
}

function scheduleHide() {
  if (hideTimer !== undefined || owner === undefined) {
    return;
  }
  const hiding = owner;
  hideTimer = window.setTimeout(() => {
    hideTimer = undefined;
    if (owner === hiding) {
      setOwner(undefined);
    }
  }, commentBadgeHideDelayMs);
}

function schedulePending() {
  if (pendingTimer !== undefined) {
    window.clearTimeout(pendingTimer);
  }
  pendingTimer = window.setTimeout(() => {
    const next = pending;
    if (next) {
      setOwner(next.id, next.corridor, true);
    }
  }, commentBadgeIntentDelayMs);
}

interface PointerPoint {
  clientX: number;
  clientY: number;
}

function insideCorridor(event: PointerPoint) {
  const bounds = ownerCorridor?.();
  return (
    bounds !== undefined &&
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
  );
}

function trackPointer(event: PointerEvent) {
  if (insideCorridor(event)) {
    clearHide();
    if (pending) {
      // Still travelling towards the badge: a crossed field must wait for a rest.
      schedulePending();
    }
  } else if (!ownerHovered) {
    scheduleHide();
  }
}

function setOwner(next: string | undefined, corridor?: CommentBadgeCorridor, hovered = false) {
  clearPending();
  clearHide();
  ownerCorridor = next === undefined ? undefined : corridor;
  ownerHovered = next !== undefined && hovered;
  if (owner === next) {
    return;
  }
  if (owner === undefined && next !== undefined) {
    window.addEventListener('pointermove', trackPointer, true);
  } else if (owner !== undefined && next === undefined) {
    window.removeEventListener('pointermove', trackPointer, true);
  }
  owner = next;
  emit();
}

export const commentBadgeOwner = {
  /** The pointer is over this field (or its badge) as the innermost commentable field. */
  hover(id: string, corridor: CommentBadgeCorridor) {
    if (owner === id) {
      ownerHovered = true;
      clearPending();
      clearHide();
      return;
    }
    if (owner === undefined) {
      setOwner(id, corridor, true);
      return;
    }
    if (pending?.id === id) {
      return;
    }
    pending = { id, corridor };
    schedulePending();
  },
  focus(id: string, corridor: CommentBadgeCorridor) {
    setOwner(id, corridor);
  },
  /** The pointer or focus left the field; its badge stays briefly reachable. */
  leave(id: string, pointer?: PointerPoint) {
    if (pending?.id === id) {
      clearPending();
    }
    if (owner === id) {
      ownerHovered = false;
      if (pointer === undefined || !insideCorridor(pointer)) {
        scheduleHide();
      }
    }
  },
  release(id: string) {
    if (pending?.id === id) {
      clearPending();
    }
    if (owner === id) {
      setOwner(undefined);
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  current: () => owner,
};

export function useCommentBadgeOwner(id: string): boolean {
  return useSyncExternalStore(
    commentBadgeOwner.subscribe,
    () => commentBadgeOwner.current() === id,
  );
}
