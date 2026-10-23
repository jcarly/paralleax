import { StrictMode, useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalPortal } from './ModalPortal';
import { FieldHelpTooltip } from './FieldHelpTooltip';
import { handleModalDialogKeyDown } from './modalDialogKeyboard';

afterEach(cleanup);

describe('modal isolation', () => {
  it('blocks application shortcuts while keeping dialog keyboard actions and restoring focus', async () => {
    const user = userEvent.setup();
    const shortcut = vi.fn();
    document.addEventListener('keydown', shortcut);
    try {
      render(
        <StrictMode>
          <Example />
        </StrictMode>,
      );
      const opener = screen.getByRole('button', { name: 'Open' });
      await user.click(opener);
      expect(opener.closest('[inert]')).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Nested' })).toHaveFocus();
      shortcut.mockClear();
      await user.keyboard('{Delete}');
      expect(shortcut).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      expect(opener.closest('[inert]')).toBeNull();
      expect(opener).toHaveFocus();
    } finally {
      document.removeEventListener('keydown', shortcut);
    }
  });

  it('honors a dialog’s explicit initial focus target', async () => {
    const user = userEvent.setup();
    render(<ExplicitFocusExample />);

    await user.click(screen.getByRole('button', { name: 'Open focused dialog' }));
    expect(screen.getByRole('textbox', { name: 'Initial focus' })).toHaveFocus();
  });

  it('keeps the underlying modal isolated until the nested modal closes', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const nestedOpener = screen.getByRole('button', { name: 'Nested' });
    await user.click(nestedOpener);
    expect(nestedOpener.closest('[inert]')).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(nestedOpener.closest('[inert]')).toBeNull();
    expect(nestedOpener).toHaveFocus();
    expect(opener.closest('[inert]')).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });

  it('isolates newly added background portals and preserves pre-existing inert and scroll states', async () => {
    const user = userEvent.setup();
    const background = document.createElement('div');
    background.setAttribute('inert', '');
    document.body.append(background);
    const latePortal = document.createElement('div');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    const view = render(<Example />);
    try {
      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(document.body.style.overflow).toBe('hidden');
      document.body.append(latePortal);
      await waitFor(() => expect(latePortal).toHaveAttribute('inert'));
      view.unmount();
      expect(background).toHaveAttribute('inert');
      expect(latePortal).not.toHaveAttribute('inert');
      expect(document.body.style.overflow).toBe('auto');
    } finally {
      view.unmount();
      background.remove();
      latePortal.remove();
      document.body.style.overflow = previousOverflow;
    }
  });

  it('keeps dialog-owned help inside the active portal', async () => {
    const user = userEvent.setup();
    render(
      <ModalPortal>
        <section role="dialog" aria-label="Help">
          <FieldHelpTooltip label="Field" help="Help text" />
        </section>
      </ModalPortal>,
    );
    await user.click(screen.getByRole('button', { name: /Field/ }));
    expect(screen.getByRole('tooltip').closest('.modal-portal')).not.toBeNull();
    expect(screen.getByRole('tooltip').closest('[inert]')).toBeNull();
  });
});

function Example() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <ModalPortal>
          <section
            role="dialog"
            aria-label="First"
            onKeyDown={(event) => handleModalDialogKeyDown(event, () => setOpen(false))}
          >
            <button autoFocus onClick={() => setNested(true)}>
              Nested
            </button>
            {nested ? (
              <ModalPortal>
                <section
                  role="dialog"
                  aria-label="Second"
                  onKeyDown={(event) => handleModalDialogKeyDown(event, () => setNested(false))}
                >
                  <button autoFocus>Last</button>
                </section>
              </ModalPortal>
            ) : null}
          </section>
        </ModalPortal>
      ) : null}
    </>
  );
}

function ExplicitFocusExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open focused dialog</button>
      {open ? (
        <ModalPortal>
          <section role="dialog" aria-label="Focused dialog">
            <button type="button">Close</button>
            <input autoFocus aria-label="Initial focus" data-modal-autofocus />
          </section>
        </ModalPortal>
      ) : null}
    </>
  );
}
