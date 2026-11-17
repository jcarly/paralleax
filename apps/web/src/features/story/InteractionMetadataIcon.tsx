export type InteractionMetadataIconKind = 'location' | 'characters' | 'time';

export function InteractionMetadataIcon({
  kind,
  className = '',
}: {
  kind: InteractionMetadataIconKind;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`interaction-metadata-icon ${className}`.trim()}
      data-interaction-metadata-icon={kind}
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {kind === 'location' ? (
        <>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.4" />
        </>
      ) : null}
      {kind === 'characters' ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ) : null}
      {kind === 'time' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : null}
    </svg>
  );
}
