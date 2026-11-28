import { useEffect, useRef, type RefObject } from 'react';
import { RichTextEditorDialog } from './RichTextEditorDialog';

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
 * Modal confirmation built on the shared dialog. Cancel takes the initial focus so
 * an irreversible action is never one accidental Enter away. While `pending`, the
 * dialog cannot be dismissed or submitted again; on failure the caller keeps it
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
    <RichTextEditorDialog
      className="confirm-dialog"
      title={title}
      description={description}
      closeLabel={closeLabel}
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
    </RichTextEditorDialog>
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
        disabled={pending}
        onClick={onCancel}
      >
        {cancelLabel}
      </button>
      <button
        className={destructive ? 'danger' : undefined}
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
