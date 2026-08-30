import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatTarget, Story } from '@paralleax/shared';
import { statTargetPathLabel } from '../storyStats';
import { RichTextVariablePicker, type RichTextVariableSelection } from './RichTextVariablePicker';
import { RichTextEditorDialog } from './RichTextEditorDialog';

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

  return (
    <RichTextEditorDialog
      className="rich-text-variable-dialog"
      closeLabel={t('richText.closeVariableDialog')}
      description={t(
        isEditing ? 'richText.editVariableDescription' : 'richText.addVariableDescription',
      )}
      title={t(isEditing ? 'richText.editVariableTitle' : 'richText.addVariableTitle')}
      onCancel={onCancel}
    >
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

      <div className="modal-dialog-actions rich-text-dialog-actions">
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
    </RichTextEditorDialog>
  );
}
