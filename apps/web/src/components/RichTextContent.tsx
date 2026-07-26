import { sanitizeRichTextForDisplay } from '../rich-text';

export function RichTextContent({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={className}
      // Content is sanitized immediately above and again by the API before persistence.
      dangerouslySetInnerHTML={{ __html: sanitizeRichTextForDisplay(html) }}
    />
  );
}
