import { useId, type MouseEvent, type ReactNode } from 'react';
import { handleModalDialogKeyDown } from './modalDialogKeyboard';
import { ModalPortal } from './ModalPortal';

interface ModalDialogProps {
  title: string;
  description: string;
  closeLabel: string;
  className?: string;
  closeDisabled?: boolean;
  children: ReactNode;
  onCancel: () => void;
}

/** Shared modal dialog shell: layering and isolation by ModalPortal, Escape and Tab by modalDialogKeyboard. */
export function ModalDialog({
  title,
  description,
  closeLabel,
  className,
  closeDisabled = false,
  children,
  onCancel,
}: ModalDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelOnBackdrop = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  };
  const hasClassName = className !== undefined && className !== '';

  return (
    <ModalPortal>
      <div
        className="modal-dialog-backdrop"
        role="presentation"
        onKeyDown={(event) => {
          handleModalDialogKeyDown(event, onCancel);
        }}
        onMouseDown={cancelOnBackdrop}
      >
        <section
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          aria-modal="true"
          className={`modal-dialog${hasClassName ? ` ${className}` : ''}`}
          role="dialog"
        >
          <header className="modal-dialog-header">
            <ModalDialogHeading ids={[titleId, descriptionId]} title={title} text={description} />
            <ModalDialogClose label={closeLabel} disabled={closeDisabled} onClick={onCancel} />
          </header>
          {children}
        </section>
      </div>
    </ModalPortal>
  );
}

function ModalDialogClose({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="ghost modal-dialog-close"
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      ×
    </button>
  );
}

function ModalDialogHeading({
  ids: [titleId, descriptionId],
  title,
  text,
}: {
  ids: [string, string];
  title: string;
  text: string;
}) {
  return (
    <div>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{text}</p>
    </div>
  );
}
