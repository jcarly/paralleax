import { useTranslation } from 'react-i18next';
import type { StatValue } from '@paralleax/shared';
import { renderReaderRichText, type ConditionalTextState } from './richTextProjection';

export type { ConditionalTextState } from './richTextProjection';

export function RichTextContent({
  html,
  className,
  conditionalTextState,
  conditionalTextBlockState,
  statValues,
  itemStatValues,
  onInteractionLinkClick,
}: {
  html: string;
  className?: string;
  conditionalTextState?: ConditionalTextState;
  conditionalTextBlockState?: ConditionalTextState;
  statValues?: Readonly<Record<string, StatValue>>;
  itemStatValues?: Readonly<Record<string, Readonly<Record<string, StatValue>>>>;
  onInteractionLinkClick?: (interactionId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={className}
      // Content is sanitized immediately above and again by the API before persistence.
      dangerouslySetInnerHTML={{
        __html: renderReaderRichText(
          html,
          conditionalTextState,
          conditionalTextBlockState,
          t('player.unavailable'),
          statValues,
          itemStatValues,
        ),
      }}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-interaction-link-target]',
        );
        if (!link || link.disabled) return;
        onInteractionLinkClick?.(link.dataset.interactionLinkTarget ?? '');
      }}
    />
  );
}
