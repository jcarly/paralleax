import { useTranslation } from 'react-i18next';
import type { MouseEvent } from 'react';
import type { StatValue } from '@paralleax/shared';
import { renderReaderRichText, type ConditionalTextState } from './richTextProjection';

export type { ConditionalTextState } from './richTextProjection';

function getInteractionLinkClickHandler(
  onInteractionLinkClick: ((interactionId: string) => void) | undefined,
  interactionLinksInteractive: boolean,
) {
  if (!interactionLinksInteractive) {
    return undefined;
  }
  return (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-interaction-link-target], button[data-conditional-text-link]',
    );
    if (!link || link.disabled) {
      return;
    }
    onInteractionLinkClick?.(
      link.dataset.interactionLinkTarget ?? link.dataset.conditionalTextLink ?? '',
    );
  };
}

export function RichTextContent({
  html,
  className,
  conditionalTextState,
  conditionalTextBlockState,
  statValues,
  itemStatValues,
  onInteractionLinkClick,
  interactionLinksInteractive = true,
}: {
  html: string;
  className?: string;
  conditionalTextState?: ConditionalTextState;
  conditionalTextBlockState?: ConditionalTextState;
  statValues?: Readonly<Record<string, StatValue>>;
  itemStatValues?: Readonly<Record<string, Readonly<Record<string, StatValue>>>>;
  onInteractionLinkClick?: (interactionId: string) => void;
  interactionLinksInteractive?: boolean;
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
          interactionLinksInteractive,
        ),
      }}
      onClick={getInteractionLinkClickHandler(onInteractionLinkClick, interactionLinksInteractive)}
    />
  );
}
