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
  template.content.querySelectorAll<HTMLElement>('[data-stat-value]').forEach((node) => {
    const statId = node.dataset.statValue ?? '';
    const itemId = node.dataset.statItem;
    const value = itemId ? itemStatValues?.[itemId]?.[statId] : statValues?.[statId];
    node.textContent = value === undefined ? '' : String(value);
  });
  return template.innerHTML;
}

export function RichTextContent({
  html,
  className,
  conditionalTextState,
  statValues,
  itemStatValues,
}: {
  html: string;
  className?: string;
  conditionalTextState?: ConditionalTextState;
  statValues?: Readonly<Record<string, StatValue>>;
  itemStatValues?: Readonly<Record<string, Readonly<Record<string, StatValue>>>>;
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
    />
  );
}
