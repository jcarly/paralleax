import { useId, type ReactNode } from 'react';
import { handleModalDialogKeyDown } from './modalDialogKeyboard';

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

  return (
    <div className="modal-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-dialog${className ? ` ${className}` : ''}`}
        role="dialog"
        onKeyDown={(event) => handleModalDialogKeyDown(event, onCancel)}
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
