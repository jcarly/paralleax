import { useTranslation } from 'react-i18next';

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
  return (
    <>
      <label>
        {label ?? t('inspector.imageUrl')}
        <input
          type="url"
          value={imageUrl ?? ''}
          placeholder="https://example.com/image.png"
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => onBlur(event.target.value)}
        />
      </label>
      {imageUrl ? <img className="context-image-preview" src={imageUrl} alt="" /> : null}
    </>
  );
}
