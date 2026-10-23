import type { KeyboardEvent } from 'react';

const focusableSelector =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export function getModalDialogFocusTargets(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.tabIndex === -1 || element.matches(':disabled, input[type="hidden"]')) return false;
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.matches('[hidden], [inert]')) return false;
      const style = window.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (ancestor === dialog) break;
    }
    return true;
  });
}

export function handleModalDialogKeyDown(event: KeyboardEvent<HTMLElement>, onCancel: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onCancel();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = getModalDialogFocusTargets(event.currentTarget);
  if (focusable.length === 0) {
    event.preventDefault();
    event.currentTarget.tabIndex = -1;
    event.currentTarget.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
