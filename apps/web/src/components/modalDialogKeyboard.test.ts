import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleModalDialogKeyDown } from './modalDialogKeyboard';

afterEach(() => {
  document.body.replaceChildren();
});

describe('modal dialog keyboard handling', () => {
  it('closes on Escape and ignores unrelated keys', () => {
    const dialog = document.createElement('div');
    const onCancel = vi.fn();
    const escape = keyboardEvent(dialog, 'Escape');

    handleModalDialogKeyDown(escape.event, onCancel);
    handleModalDialogKeyDown(keyboardEvent(dialog, 'Enter').event, onCancel);

    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('does nothing when a dialog has no visible focus target', () => {
    const dialog = document.createElement('div');
    dialog.innerHTML = '<button disabled>Disabled</button><button hidden>Hidden</button>';
    const tab = keyboardEvent(dialog, 'Tab');

    handleModalDialogKeyDown(tab.event, vi.fn());

    expect(tab.preventDefault).not.toHaveBeenCalled();
  });

  it('wraps focus backwards from the first control', () => {
    const { dialog, first, last } = focusableDialog();
    first.focus();
    const tab = keyboardEvent(dialog, 'Tab', true);

    handleModalDialogKeyDown(tab.event, vi.fn());

    expect(tab.preventDefault).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(last);
  });

  it('wraps focus forwards from the last control', () => {
    const { dialog, first, last } = focusableDialog();
    last.focus();
    const tab = keyboardEvent(dialog, 'Tab');

    handleModalDialogKeyDown(tab.event, vi.fn());

    expect(tab.preventDefault).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(first);
  });

  it('lets the browser move focus between internal controls', () => {
    const { dialog, middle } = focusableDialog();
    middle.focus();
    const forwards = keyboardEvent(dialog, 'Tab');
    const backwards = keyboardEvent(dialog, 'Tab', true);

    handleModalDialogKeyDown(forwards.event, vi.fn());
    handleModalDialogKeyDown(backwards.event, vi.fn());

    expect(forwards.preventDefault).not.toHaveBeenCalled();
    expect(backwards.preventDefault).not.toHaveBeenCalled();
  });
});

function focusableDialog() {
  const dialog = document.createElement('div');
  dialog.innerHTML = `
    <button data-id="first">First</button>
    <input data-id="middle" />
    <a data-id="last" href="#target">Last</a>
    <button hidden>Hidden</button>
    <button tabindex="-1">Skipped</button>
  `;
  document.body.append(dialog);
  return {
    dialog,
    first: dialog.querySelector<HTMLElement>('[data-id="first"]')!,
    middle: dialog.querySelector<HTMLElement>('[data-id="middle"]')!,
    last: dialog.querySelector<HTMLElement>('[data-id="last"]')!,
  };
}

function keyboardEvent(currentTarget: HTMLElement, key: string, shiftKey = false) {
  const preventDefault = vi.fn();
  return {
    preventDefault,
    event: {
      key,
      shiftKey,
      currentTarget,
      preventDefault,
    } as unknown as KeyboardEvent<HTMLElement>,
  };
}
