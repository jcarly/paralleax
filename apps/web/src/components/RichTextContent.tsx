import { sanitizeRichTextForDisplay } from '../rich-text';
import { useTranslation } from 'react-i18next';
import type { StatValue } from '@paralleax/shared';

export type ConditionalTextState = Readonly<
  Record<
    string,
    {
      visible: boolean;
      available: boolean;
      reason?: string;
    }
  >
>;

function renderRichText(
  html: string,
  conditionalTextState: ConditionalTextState | undefined,
  unavailableMessage: string,
  statValues: Readonly<Record<string, StatValue>> | undefined,
  itemStatValues: Readonly<Record<string, Readonly<Record<string, StatValue>>>> | undefined,
) {
  const sanitized = sanitizeRichTextForDisplay(html);
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  if (conditionalTextState) {
    template.content
      .querySelectorAll<HTMLElement>('[data-conditional-text-target]')
      .forEach((frame) => {
        const targetId = frame.dataset.conditionalTextTarget ?? '';
        const state = conditionalTextState[targetId];
        if (!state?.visible) {
          frame.remove();
          return;
        }
        frame.classList.add('conditional-text');
        if (!state.available) {
          frame.classList.add('conditional-text-unavailable');
          frame.title = state.reason ?? unavailableMessage;
          const explanation = document.createElement('small');
          explanation.className = 'conditional-text-reason';
          explanation.textContent = frame.title;
          frame.append(explanation);
        }
      });
  }
  template.content
    .querySelectorAll<HTMLElement>('[data-interaction-link-target]')
    .forEach((marker) => {
      const targetId = marker.dataset.interactionLinkTarget ?? '';
      const state = conditionalTextState?.[targetId];
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'interaction-link';
      link.dataset.interactionLinkTarget = targetId;
      link.textContent = marker.textContent;
      if (conditionalTextState && !state?.available) {
        link.disabled = true;
        link.title = state?.reason ?? unavailableMessage;
      }
      marker.replaceWith(link);
    });
  removeUnresolvedStatReferences(template.content);
  template.content.querySelectorAll<HTMLElement>('[data-stat-value]').forEach((node) => {
    const statId = node.dataset.statValue ?? '';
    const itemId = node.dataset.statItem;
    const value = itemId ? itemStatValues?.[itemId]?.[statId] : statValues?.[statId];
    node.textContent = value === undefined ? '' : String(value);
  });
  return template.innerHTML;
}

function removeUnresolvedStatReferences(content: DocumentFragment) {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((node) => {
    if (node.parentElement?.closest('[data-stat-value]')) return;
    node.data = node.data.replace(/\{\{[^{}]*\}\}/g, '');
  });
}

export function RichTextContent({
  html,
  className,
  conditionalTextState,
  statValues,
  itemStatValues,
  onInteractionLinkClick,
}: {
  html: string;
  className?: string;
  conditionalTextState?: ConditionalTextState;
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
        __html: renderRichText(
          html,
          conditionalTextState,
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
