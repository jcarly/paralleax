export function ImageUrlField({
  imageUrl,
  label = 'Image URL',
  onChange,
  onBlur,
}: {
  imageUrl?: string;
  label?: string;
  onChange: (imageUrl: string) => void;
  onBlur: (imageUrl: string) => void;
}) {
  return (
    <>
      <label>
        {label}
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
