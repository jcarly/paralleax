import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RichTextEditorDialog } from './RichTextEditorDialog';

export function ImageUrlDialog({
  imageUrl,
  onCancel,
  onSave,
}: {
  imageUrl?: string;
  onCancel: () => void;
  onSave: (imageUrl: string) => void;
}) {
  const { t } = useTranslation();
  const [nextImageUrl, setNextImageUrl] = useState(imageUrl ?? '');

  return (
    <RichTextEditorDialog
      className="image-url-dialog"
      closeLabel={t('inspector.closeImageDialog')}
      description={t('inspector.imageDialogDescription')}
      title={t('inspector.imageDialogTitle')}
      onCancel={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(nextImageUrl.trim());
        }}
      >
        <label>
          {t('inspector.imageUrl')}
          <input
            autoFocus
            placeholder="https://example.com/image.png"
            type="url"
            value={nextImageUrl}
            onChange={(event) => setNextImageUrl(event.target.value)}
          />
        </label>
        {nextImageUrl ? <img className="image-url-dialog-preview" src={nextImageUrl} alt="" /> : null}
        <div className="modal-dialog-actions image-url-dialog-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            {t('inspector.cancelImage')}
          </button>
          <button type="submit">{t('inspector.saveImage')}</button>
        </div>
      </form>
    </RichTextEditorDialog>
  );
}
