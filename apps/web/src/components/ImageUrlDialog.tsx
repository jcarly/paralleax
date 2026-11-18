import { useState, type ChangeEvent } from 'react';
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
  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNextImageUrl(event.currentTarget.value);
  };

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
        <ImageUrlField
          label={t('inspector.imageUrl')}
          value={nextImageUrl}
          onChange={handleImageChange}
        />
        {nextImageUrl ? (
          <img className="image-url-dialog-preview" src={nextImageUrl} alt="" />
        ) : null}
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

function ImageUrlField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="form-field form-field--standard">
      {label}
      <input
        className="form-control form-control--standard"
        autoFocus
        data-modal-autofocus
        placeholder="https://example.com/image.png"
        type="url"
        value={value}
        onChange={onChange}
      />
    </label>
  );
}
