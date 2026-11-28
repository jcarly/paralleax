import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Remove it?"
      description="It will be gone."
      confirmLabel="Remove"
      cancelLabel="Keep"
      closeLabel="Close"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

it('focuses Cancel, traps Tab and cancels on Escape', async () => {
  const user = userEvent.setup();
  const { onConfirm, onCancel } = renderDialog({ destructive: true });
  expect(screen.getByRole('button', { name: 'Keep' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('danger');

  await user.tab();
  expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

  await user.keyboard('{Escape}');
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('ignores dismissal while pending and announces an error', async () => {
  const user = userEvent.setup();
  const { onCancel, onConfirm } = renderDialog({ pending: true, error: 'It failed' });
  expect(screen.getByRole('alert')).toHaveTextContent('It failed');
  expect(screen.getByRole('button', { name: 'Remove' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await user.click(screen.getByRole('button', { name: 'Keep' }));
  expect(onCancel).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});
