import {
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

function enabledButtons(toolbar: HTMLElement) {
  return [...toolbar.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => !button.disabled,
  );
}

const keySteps: Readonly<Record<string, (current: number, last: number) => number>> = {
  ArrowRight: (current, last) => (current === last ? 0 : current + 1),
  ArrowDown: (current, last) => (current === last ? 0 : current + 1),
  ArrowLeft: (current, last) => (current === 0 ? last : current - 1),
  ArrowUp: (current, last) => (current === 0 ? last : current - 1),
  Home: () => 0,
  End: (_current, last) => last,
};

function moveToolbarFocus(buttons: HTMLButtonElement[], from: number, to: number) {
  buttons[from].tabIndex = -1;
  buttons[to].tabIndex = 0;
  buttons[to].focus();
}

/**
 * WAI-ARIA toolbar keyboard model: the toolbar is one Tab stop, and arrow keys,
 * Home and End move between its buttons. The last focused button keeps the stop.
 */
export function useRovingToolbar(toolbarRef: RefObject<HTMLElement | null>) {
  const activeIndex = useRef(0);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) {
      return;
    }
    const buttons = enabledButtons(toolbar);
    activeIndex.current = Math.min(activeIndex.current, Math.max(buttons.length - 1, 0));
    toolbar.querySelectorAll('button').forEach((button) => {
      button.tabIndex = -1;
    });
    const active = buttons.at(activeIndex.current);
    if (active) {
      active.tabIndex = 0;
    }
  });

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const step = Object.hasOwn(keySteps, event.key) ? keySteps[event.key] : undefined;
    const buttons = enabledButtons(event.currentTarget);
    const current = buttons.findIndex((button) => button === document.activeElement);
    if (step === undefined || current < 0) {
      return;
    }
    event.preventDefault();
    const next = step(current, buttons.length - 1);
    moveToolbarFocus(buttons, current, next);
    activeIndex.current = next;
  }

  function onFocus(event: FocusEvent<HTMLElement>) {
    if (event.target instanceof HTMLButtonElement) {
      const index = enabledButtons(event.currentTarget).indexOf(event.target);
      activeIndex.current = Math.max(index, 0);
    }
  }

  return { onKeyDown, onFocus };
}
