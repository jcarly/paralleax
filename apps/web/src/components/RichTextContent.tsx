import { sanitizeRichTextForDisplay } from '../rich-text';

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

function renderRichText(html: string, conditionalTextState?: ConditionalTextState) {
  const sanitized = sanitizeRichTextForDisplay(html);
  if (!conditionalTextState) return sanitized;
  const template = document.createElement('template');
  template.innerHTML = sanitized;
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
        frame.title = state.reason ?? 'Unavailable in the current simulation state';
        const explanation = document.createElement('small');
        explanation.className = 'conditional-text-reason';
        explanation.textContent = frame.title;
        frame.append(explanation);
      }
    });
  return template.innerHTML;
}

export function RichTextContent({
  html,
  className,
  conditionalTextState,
}: {
  html: string;
  className?: string;
  conditionalTextState?: ConditionalTextState;
}) {
  return (
    <div
      className={className}
      // Content is sanitized immediately above and again by the API before persistence.
      dangerouslySetInnerHTML={{ __html: renderRichText(html, conditionalTextState) }}
    />
  );
}
