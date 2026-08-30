// sanitize-html exposes a CommonJS `export =` entry point in the NestJS runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sanitizeHtml = require('sanitize-html');
import { resolveStatInterpolationTarget, type Story } from '@paralleax/shared';

export function sanitizeRichText(value: string, story?: Story): string {
  const inertMarkerSpanStack: boolean[] = [];
  let inertMarkerDepth = 0;
  return sanitizeHtml(value, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'h2',
      'h3',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'video',
      'source',
      'iframe',
      'div',
      'button',
      'span',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      video: ['src', 'controls', 'poster'],
      source: ['src', 'type'],
      iframe: ['src', 'title', 'allow', 'allowfullscreen'],
      div: [
        'data-conditional-text-target',
        'data-conditional-text-block',
        'data-rich-text-conditional-controls',
      ],
      button: ['type', 'contenteditable', 'aria-label', 'data-conditional-text-link'],
      span: [
        'contenteditable',
        'data-conditional-text-block',
        'data-rich-text-conditional-controls',
        'data-stat-value',
        'data-stat-item',
        'data-interaction-link-target',
      ],
    },
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      video: ['http', 'https'],
      source: ['http', 'https'],
      iframe: ['https'],
    },
    allowedIframeHostnames: [
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
    ],
    exclusiveFilter: ({ tag, attribs }) =>
      (tag === 'div' || tag === 'span') &&
      attribs['data-rich-text-conditional-controls'] !== undefined,
    onOpenTag: (tagName, attributes) => {
      if (tagName !== 'span') return;
      const isInertMarker =
        attributes['data-stat-value'] !== undefined ||
        attributes['data-interaction-link-target'] !== undefined;
      inertMarkerSpanStack.push(isInertMarker);
      if (isInertMarker) inertMarkerDepth += 1;
    },
    onCloseTag: (tagName) => {
      if (tagName !== 'span') return;
      if (inertMarkerSpanStack.pop()) inertMarkerDepth -= 1;
    },
    textFilter: story
      ? (text, tagName) =>
          inertMarkerDepth > 0 || tagName === 'button'
            ? text
            : compileStatInterpolationText(text, story)
      : undefined,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: 'a',
        attribs: {
          ...attributes,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      video: (_tagName, attributes) => ({
        tagName: 'video',
        attribs: { ...attributes, controls: '' },
      }),
      span: (_tagName, attributes) => {
        const sanitizedAttributes = { ...attributes };
        const interactionTarget = sanitizedAttributes['data-interaction-link-target'];
        if (
          interactionTarget &&
          story &&
          !story.interactions.some(({ id }) => id === interactionTarget)
        ) {
          delete sanitizedAttributes['data-interaction-link-target'];
        }
        const isInertMarker =
          sanitizedAttributes['data-stat-value'] !== undefined ||
          sanitizedAttributes['data-interaction-link-target'] !== undefined;
        return {
          tagName: 'span',
          attribs: isInertMarker
            ? { ...sanitizedAttributes, contenteditable: 'false' }
            : sanitizedAttributes,
        };
      },
    },
  });
}

function compileStatInterpolationText(text: string, story: Story): string {
  return text.replace(/\{\{([^{}]*)\}\}/g, (source, escapedExpression: string) => {
    const target = resolveStatInterpolationTarget(story, decodeSanitizedText(escapedExpression));
    if (!target) return source;
    const itemAttribute = target.itemId
      ? ` data-stat-item="${escapeHtmlAttribute(target.itemId)}"`
      : '';
    return `<span contenteditable="false" data-stat-value="${escapeHtmlAttribute(target.assignment.id)}"${itemAttribute}>${source}</span>`;
  });
}

function decodeSanitizedText(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (entity) =>
    decodeHtmlEntity(entity),
  );
}

function decodeHtmlEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': '\u00a0',
  };
  const named = namedEntities[normalized];
  if (named !== undefined) return named;
  const radix = normalized.startsWith('&#x') ? 16 : 10;
  const digits = normalized.slice(radix === 16 ? 3 : 2, -1);
  const codePoint = Number.parseInt(digits, radix);
  return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : entity;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
