import type { KeyboardEvent } from 'react';

const focusableSelector =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export function handleModalDialogKeyDown(event: KeyboardEvent<HTMLElement>, onCancel: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onCancel();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => !element.hasAttribute('hidden') && element.tabIndex !== -1);
  if (focusable.length === 0) return;

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
