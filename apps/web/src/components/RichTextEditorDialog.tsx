import { useId, type KeyboardEvent, type ReactNode } from 'react';

export function RichTextEditorDialog({
  title,
  description,
  closeLabel,
  className,
  children,
  onCancel,
}: {
  title: string;
  description: string;
  closeLabel: string;
  className?: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    );
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

  return (
    <div className="modal-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rich-text-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            aria-label={closeLabel}
            className="ghost rich-text-dialog-close"
            title={closeLabel}
            type="button"
            onClick={onCancel}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
