import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePendingSaveGuard } from './usePendingSaveGuard';

function GuardFixture({ active }: { active: boolean }) {
  usePendingSaveGuard(active);
  return (
    <a href="/other" onClick={(event) => event.preventDefault()}>
      Leave editor
    </a>
  );
}

describe('usePendingSaveGuard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('marks browser unload as cancelable while a save is unresolved', () => {
    const { rerender } = render(<GuardFixture active />);
    const pendingUnload = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(pendingUnload);
    expect(pendingUnload.defaultPrevented).toBe(true);

    rerender(<GuardFixture active={false} />);
    const completedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(completedUnload);
    expect(completedUnload.defaultPrevented).toBe(false);
  });

  it('confirms internal links and preserves the editor when leaving is rejected', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GuardFixture active />);

    expect(fireEvent.click(screen.getByRole('link', { name: 'Leave editor' }))).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      'This story still has unsaved changes. Leave this page and discard them?',
    );
  });

  it('does not intercept links after saving completes', () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<GuardFixture active={false} />);

    fireEvent.click(screen.getByRole('link', { name: 'Leave editor' }));
    expect(confirm).not.toHaveBeenCalled();
  });
});
