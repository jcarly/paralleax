import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { RichTextEditorDialog } from './RichTextEditorDialog';

interface PendingSaveDialogProps {
  stayButton: RefObject<HTMLButtonElement | null>;
  onStay: () => void;
  onLeave: () => void;
}

export function PendingSaveDialog({ stayButton, onStay, onLeave }: PendingSaveDialogProps) {
  const { t } = useTranslation();
  return (
    <RichTextEditorDialog
      title={t('pendingSave.title')}
      description={t('pendingSave.description')}
      closeLabel={t('pendingSave.close')}
      onCancel={onStay}
    >
      <div className="modal-dialog-actions">
        <button ref={stayButton} type="button" onClick={onStay}>
          {t('pendingSave.stay')}
        </button>
        <button type="button" onClick={onLeave}>
          {t('pendingSave.leave')}
        </button>
      </div>
    </RichTextEditorDialog>
  );
}
