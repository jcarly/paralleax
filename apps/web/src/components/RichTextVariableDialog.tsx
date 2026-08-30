import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatTarget, Story } from '@paralleax/shared';
import { statTargetPathLabel } from '../storyStats';
import { RichTextVariablePicker, type RichTextVariableSelection } from './RichTextVariablePicker';

export function RichTextVariableDialog({
  story,
  initialTarget,
  initialReference,
  mode,
  onCancel,
  onConfirm,
}: {
  story: Story;
  initialTarget?: StatTarget;
  initialReference?: string;
  mode: 'create' | 'edit';
  onCancel: () => void;
  onConfirm: (target: StatTarget, reference: string) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const isEditing = mode === 'edit';
  const [selection, setSelection] = useState<RichTextVariableSelection | undefined>(() =>
    initialTarget && initialReference
      ? {
          target: initialTarget,
          reference: initialReference,
          label: statTargetPathLabel(initialTarget, t('attributes.owner.story')),
        }
      : undefined,
  );

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
        className="modal-dialog rich-text-variable-dialog"
        role="dialog"
        onKeyDown={handleDialogKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rich-text-variable-dialog-header">
          <div>
            <h2 id={titleId}>
              {t(isEditing ? 'richText.editVariableTitle' : 'richText.addVariableTitle')}
            </h2>
            <p id={descriptionId}>
              {t(
                isEditing ? 'richText.editVariableDescription' : 'richText.addVariableDescription',
              )}
            </p>
          </div>
          <button
            aria-label={t('richText.closeVariableDialog')}
            className="ghost rich-text-variable-dialog-close"
            title={t('richText.closeVariableDialog')}
            type="button"
            onClick={onCancel}
          >
            ×
          </button>
        </header>

        <RichTextVariablePicker
          autoFocus
          story={story}
          selectedTarget={initialTarget}
          onSelectionClear={() => setSelection(undefined)}
          onSelect={setSelection}
        />

        {selection ? (
          <p className="rich-text-variable-dialog-selection">
            {t('richText.selectedVariable')} <strong>{selection.label}</strong>
          </p>
        ) : null}

        <div className="modal-dialog-actions rich-text-variable-dialog-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            {t('richText.cancelVariable')}
          </button>
          <button
            disabled={!selection}
            type="button"
            onClick={() => {
              if (selection) onConfirm(selection.target, selection.reference);
            }}
          >
            {t(isEditing ? 'richText.updateVariable' : 'richText.insertVariable')}
          </button>
        </div>
      </section>
    </div>
  );
}
