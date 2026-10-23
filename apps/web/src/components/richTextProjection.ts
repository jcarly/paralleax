import type { StatValue } from '@paralleax/shared';
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

export function renderReaderRichText(
  html: string,
  conditionalTextState: ConditionalTextState | undefined,
  conditionalTextBlockState: ConditionalTextState | undefined,
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
  if (conditionalTextBlockState) {
    template.content
      .querySelectorAll<HTMLElement>('[data-conditional-text-block]')
      .forEach((frame) => {
        const blockId = frame.dataset.conditionalTextBlock ?? '';
        const state = conditionalTextBlockState[blockId];
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

export function hasVisibleRichTextContent(
  html: string,
  conditionalTextState?: ConditionalTextState,
  conditionalTextBlockState?: ConditionalTextState,
  statValues?: Readonly<Record<string, StatValue>>,
  itemStatValues?: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
): boolean {
  const rendered = renderReaderRichText(
    html,
    conditionalTextState,
    conditionalTextBlockState,
    '',
    statValues,
    itemStatValues,
  );
  const template = document.createElement('template');
  template.innerHTML = rendered;
  if ((template.content.textContent ?? '').replace(/[\s\u200B\uFEFF]/gu, '')) return true;
  return Boolean(
    template.content.querySelector('img, video, audio, iframe, hr, canvas, svg, object, embed'),
  );
}
