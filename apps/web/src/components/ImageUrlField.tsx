import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUrlDialog } from './ImageUrlDialog';

export function ImageUrlField({
  imageUrl,
  label,
  onChange,
  onBlur,
}: {
  imageUrl?: string;
  label?: string;
  onChange: (imageUrl: string) => void;
  onBlur: (imageUrl: string) => void;
}) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const actionLabel = imageUrl ? t('inspector.editImage') : t('inspector.addImage');

  return (
    <>
      <button
        aria-label={actionLabel}
        className="inspector-image-frame"
        title={label ?? t('inspector.imageUrl')}
        type="button"
        onClick={() => setIsDialogOpen(true)}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" />
        ) : (
          <span aria-hidden="true">{t('inspector.imagePlaceholder')}</span>
        )}
      </button>
      {isDialogOpen ? (
        <ImageUrlDialog
          imageUrl={imageUrl}
          onCancel={() => setIsDialogOpen(false)}
          onSave={(nextImageUrl) => {
            onChange(nextImageUrl);
            onBlur(nextImageUrl);
            setIsDialogOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
