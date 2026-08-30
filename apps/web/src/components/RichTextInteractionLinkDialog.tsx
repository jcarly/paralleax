import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { RichTextEditorDialog } from './RichTextEditorDialog';

export interface RichTextInteractionLinkValue {
  targetId: string;
  text: string;
}

export function RichTextInteractionLinkDialog({
  targets,
  initialValue,
  mode,
  onCancel,
  onConfirm,
}: {
  targets: Array<{ id: string; title: string }>;
  initialValue?: RichTextInteractionLinkValue;
  mode: 'create' | 'edit';
  onCancel: () => void;
  onConfirm: (value: RichTextInteractionLinkValue) => void;
}) {
  const { t } = useTranslation();
  const isEditing = mode === 'edit';
  const [text, setText] = useState(initialValue?.text ?? '');
  const [targetId, setTargetId] = useState(initialValue?.targetId ?? '');
  const canConfirm = Boolean(text.trim() && targets.some(({ id }) => id === targetId));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canConfirm) return;
    onConfirm({ targetId, text: text.trim() });
  }

  return (
    <RichTextEditorDialog
      className="rich-text-interaction-link-dialog"
      closeLabel={t('richText.closeInteractionLinkDialog')}
      description={t(
        isEditing
          ? 'richText.editInteractionLinkDescription'
          : 'richText.addInteractionLinkDescription',
      )}
      title={t(
        isEditing ? 'richText.editInteractionLinkTitle' : 'richText.addInteractionLinkTitle',
      )}
      onCancel={onCancel}
    >
      <form className="rich-text-interaction-link-form" onSubmit={submit}>
        <label className="rich-text-variable-field">
          {t('richText.linkText')}
          <input
            autoFocus
            value={text}
            placeholder={t('richText.linkTextPlaceholder')}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="rich-text-variable-field">
          {t('richText.targetInteraction')}
          <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            <option value="" disabled>
              {t('richText.chooseInteractionTarget')}
            </option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.title}
              </option>
            ))}
          </select>
        </label>

        <div className="modal-dialog-actions rich-text-dialog-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            {t('richText.cancelInteractionLink')}
          </button>
          <button disabled={!canConfirm} type="submit">
            {t(isEditing ? 'richText.updateInteractionLink' : 'richText.insertInteractionLink')}
          </button>
        </div>
      </form>
    </RichTextEditorDialog>
  );
}
