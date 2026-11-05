import { useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { getGuideCardPosition } from './guidePlacement';
import type { GuideCardPosition, GuideRect } from './guidePlacement';

export type OnboardingGuideFocus =
  | 'create-story'
  | 'discover-interactions'
  | 'write-scene'
  | 'create-branch'
  | 'test-story-editor'
  | 'test-story-simulation'
  | null;

interface GuideOverlayState {
  focus: OnboardingGuideFocus;
  positionerRef: RefObject<HTMLDivElement | null>;
  setPosition: Dispatch<SetStateAction<GuideCardPosition>>;
  highlightedTarget?: HTMLElement;
  resizeObserver?: ResizeObserver;
}

const targetCandidates: Record<Exclude<OnboardingGuideFocus, null>, string[]> = {
  'create-story': ['story-create'],
  'discover-interactions': ['interaction', 'graph'],
  'write-scene': ['scene-inspector', 'interaction', 'graph'],
  'create-branch': ['branch-add', 'interaction', 'graph'],
  'test-story-editor': ['simulation-launch'],
  'test-story-simulation': ['simulation-choices'],
};

function findFocusTarget(focus: OnboardingGuideFocus): HTMLElement | undefined {
  if (!focus) {
    return undefined;
  }
  for (const name of targetCandidates[focus]) {
    const target = document.querySelector<HTMLElement>(`[data-onboarding-target="${name}"]`);
    if (target) {
      return target;
    }
  }
  return undefined;
}

function updateHighlightedTarget(state: GuideOverlayState, target?: HTMLElement) {
  if (target === state.highlightedTarget) {
    return;
  }
  if (state.highlightedTarget) {
    state.resizeObserver?.unobserve(state.highlightedTarget);
    state.highlightedTarget.classList.remove('onboarding-target-highlight');
  }
  state.highlightedTarget = target;
  if (target) {
    target.classList.add('onboarding-target-highlight');
    state.resizeObserver?.observe(target);
  }
}

function samePosition(first: GuideCardPosition, second: GuideCardPosition): boolean {
  return (
    first.left === second.left &&
    first.top === second.top &&
    first.bottom === second.bottom &&
    first.placement === second.placement
  );
}

function updateCardPosition(state: GuideOverlayState) {
  const cardRect = state.positionerRef.current?.getBoundingClientRect();
  const targetBounds = state.highlightedTarget?.getBoundingClientRect();
  const targetRect: GuideRect | undefined = targetBounds
    ? {
        top: targetBounds.top,
        right: targetBounds.right,
        bottom: targetBounds.bottom,
        left: targetBounds.left,
        width: targetBounds.width,
        height: targetBounds.height,
      }
    : undefined;
  const nextPosition = getGuideCardPosition(
    { width: cardRect?.width ?? 0, height: cardRect?.height ?? 0 },
    targetRect,
    { width: window.innerWidth, height: window.innerHeight },
  );
  state.setPosition((current) => (samePosition(current, nextPosition) ? current : nextPosition));
}

function refreshGuideOverlay(state: GuideOverlayState) {
  updateHighlightedTarget(state, findFocusTarget(state.focus));
  updateCardPosition(state);
}

function observeGuideChanges(update: () => void) {
  const mutationObserver = new MutationObserver(update);
  mutationObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-onboarding-target'],
    childList: true,
    subtree: true,
  });
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update, true);
  window.addEventListener('pointerup', update, true);

  return () => {
    mutationObserver.disconnect();
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('pointerup', update, true);
  };
}

function useGuideOverlayPosition(
  focus: OnboardingGuideFocus,
  positionerRef: RefObject<HTMLDivElement | null>,
) {
  const [position, setPosition] = useState(() =>
    getGuideCardPosition({ width: 352, height: 190 }, undefined, {
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  );

  useLayoutEffect(() => {
    const state: GuideOverlayState = { focus, positionerRef, setPosition };
    const update = () => refreshGuideOverlay(state);
    if (typeof ResizeObserver !== 'undefined') {
      state.resizeObserver = new ResizeObserver(update);
      if (positionerRef.current) {
        state.resizeObserver.observe(positionerRef.current);
      }
    }
    const stopObserving = observeGuideChanges(update);
    update();

    return () => {
      state.highlightedTarget?.classList.remove('onboarding-target-highlight');
      state.resizeObserver?.disconnect();
      stopObserving();
    };
  }, [focus, positionerRef]);

  return position;
}

export function OnboardingGuideOverlay({
  focus,
  children,
}: {
  focus: OnboardingGuideFocus;
  children: ReactNode;
}) {
  const positionerRef = useRef<HTMLDivElement>(null);
  const position = useGuideOverlayPosition(focus, positionerRef);

  return createPortal(
    <div className="onboarding-guide-layer">
      <div
        className="onboarding-guide-positioner"
        data-placement={position.placement}
        ref={positionerRef}
        style={{
          left: `${position.left}px`,
          top: position.top === undefined ? 'auto' : `${position.top}px`,
          bottom: position.bottom === undefined ? 'auto' : `${position.bottom}px`,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
