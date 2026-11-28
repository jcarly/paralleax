import { useEffect, useRef, type RefObject } from 'react';
import { ModalDialog } from './ModalDialog';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation built on `ModalDialog`. Cancel takes the initial focus so
 * an irreversible action is never one accidental Enter away. While `pending`, the
 * dialog cannot be dismissed or submitted again (buttons use `aria-disabled` so the
 * focus stays on the pressed button instead of falling to the page); on failure the caller keeps it
 * open and passes `error` so the author can retry.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  destructive = false,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);
  const cancelUnlessPending = () => {
    if (!pending) {
      onCancel();
    }
  };

  return (
    <ModalDialog
      className="confirm-dialog"
      title={title}
      description={description}
      closeLabel={closeLabel}
      closeDisabled={pending}
      onCancel={cancelUnlessPending}
    >
      {error !== undefined && error !== '' ? (
        <p className="error confirm-dialog-error" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialogActions
        cancelButton={cancelButton}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        destructive={destructive}
        pending={pending}
        onConfirm={onConfirm}
        onCancel={cancelUnlessPending}
      />
    </ModalDialog>
  );
}

function ConfirmDialogActions({
  cancelButton,
  cancelLabel,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
  onCancel,
}: {
  cancelButton: RefObject<HTMLButtonElement | null>;
  cancelLabel: string;
  confirmLabel: string;
  destructive: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-dialog-actions confirm-dialog-actions">
      <button
        ref={cancelButton}
        className="secondary"
        type="button"
        aria-disabled={pending}
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        className={destructive ? 'danger' : undefined}
        type="button"
        aria-disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (!pending) {
            onConfirm();
          }
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
