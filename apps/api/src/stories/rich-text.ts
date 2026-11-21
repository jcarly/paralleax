import * as sanitizeHtml from 'sanitize-html';
import {
  resolveStatInterpolationTarget,
  type NativeStoryIdMaps,
  type Story,
} from '@paralleax/shared';

const ALLOWED_TAGS = [
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
];

const ALLOWED_ATTRIBUTES = {
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
};

const ALLOWED_SCHEMES_BY_TAG = {
  img: ['http', 'https'],
  video: ['http', 'https'],
  source: ['http', 'https'],
  iframe: ['https'],
};

const ALLOWED_IFRAME_HOSTNAMES = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
];

type InertMarkerState = {
  spanStack: boolean[];
  depth: number;
};

export type NativeRichTextReference =
  | { kind: 'interaction' | 'block' | 'orphanItem'; id: string }
  | { kind: 'stat'; id: string; itemId?: string };

type NativeRichTextElement = { tag: string; attributes: sanitizeHtml.Attributes };

export function sanitizeRichText(value: string, story?: Story): string {
  const markerState: InertMarkerState = { spanStack: [], depth: 0 };
  return sanitizeHtml(value, createSanitizerOptions(story, markerState));
}

/** Sanitize imported HTML while rewriting only structured internal reference attributes. */
export function sanitizeAndRemapStoryRichText(value: string, maps: NativeStoryIdMaps): string {
  const markerState: InertMarkerState = { spanStack: [], depth: 0 };
  return sanitizeHtml(value, createSanitizerOptions(undefined, markerState, maps));
}

/** Inspect the same parser and allowlist used to sanitize authored HTML. */
export function inspectNativeStoryRichText(value: string): {
  sanitized: string;
  references: NativeRichTextReference[];
  supported: boolean;
} {
  const markerState: InertMarkerState = { spanStack: [], depth: 0 };
  const references: NativeRichTextReference[] = [];
  const original: NativeRichTextElement[] = [];
  const sanitized = sanitizeHtml(
    value,
    createSanitizerOptions(undefined, markerState, undefined, (tag, attrs) => {
      original.push({ tag, attributes: { ...attrs } });
      collectNativeRichTextReferences(tag, attrs, references);
    }),
  );
  const normalized = collectRichTextElements(sanitized);
  return {
    sanitized,
    references,
    supported: !value.includes('<!--') && elementsPreserved(original, normalized),
  };
}

function collectRichTextElements(value: string): NativeRichTextElement[] {
  const elements: NativeRichTextElement[] = [];
  const state: InertMarkerState = { spanStack: [], depth: 0 };
  sanitizeHtml(
    value,
    createSanitizerOptions(undefined, state, undefined, (tag, attributes) => {
      elements.push({ tag, attributes: { ...attributes } });
    }),
  );
  return elements;
}

function elementsPreserved(
  original: NativeRichTextElement[],
  normalized: NativeRichTextElement[],
): boolean {
  if (original.length !== normalized.length) {
    return false;
  }
  return original.every((element, index) => {
    const target = normalized.at(index);
    return (
      element.tag === target?.tag &&
      Object.entries(element.attributes).every(
        ([key, value]) => Object.hasOwn(target.attributes, key) && target.attributes[key] === value,
      )
    );
  });
}

function createSanitizerOptions(
  story: Story | undefined,
  markerState: InertMarkerState,
  maps?: NativeStoryIdMaps,
  visit?: (tag: string, attributes: sanitizeHtml.Attributes) => void,
): sanitizeHtml.IOptions {
  return {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: ALLOWED_SCHEMES_BY_TAG,
    allowedIframeHostnames: ALLOWED_IFRAME_HOSTNAMES,
    exclusiveFilter: ({ tag, attribs }) =>
      (tag === 'div' || tag === 'span') &&
      attribs['data-rich-text-conditional-controls'] !== undefined,
    onOpenTag: (tagName, attributes) => {
      trackInertMarkerOpen(tagName, attributes, markerState);
      visit?.(tagName, attributes);
    },
    onCloseTag: (tagName) => {
      trackInertMarkerClose(tagName, markerState);
    },
    textFilter: story ? createTextFilter(story, markerState) : undefined,
    transformTags: createTagTransformers(story, maps),
  };
}

function collectNativeRichTextReferences(
  tag: string,
  attributes: sanitizeHtml.Attributes,
  references: NativeRichTextReference[],
): void {
  if (tag === 'div' || tag === 'span') {
    addRichTextReference(attributes, 'data-conditional-text-block', 'block', references);
  }
  if (tag === 'div') {
    addRichTextReference(attributes, 'data-conditional-text-target', 'interaction', references);
  }
  if (tag === 'button') {
    addRichTextReference(attributes, 'data-conditional-text-link', 'interaction', references);
  }
  if (tag === 'span') {
    addRichTextReference(attributes, 'data-interaction-link-target', 'interaction', references);
    addStatRichTextReference(attributes, references);
  }
}

function addRichTextReference(
  attributes: sanitizeHtml.Attributes,
  attribute: string,
  kind: 'interaction' | 'block',
  references: NativeRichTextReference[],
): void {
  if (Object.hasOwn(attributes, attribute)) {
    references.push({ kind, id: attributes[attribute] });
  }
}

function addStatRichTextReference(
  attributes: sanitizeHtml.Attributes,
  references: NativeRichTextReference[],
): void {
  const hasStat = Object.hasOwn(attributes, 'data-stat-value');
  const hasItem = Object.hasOwn(attributes, 'data-stat-item');
  if (hasStat) {
    references.push({
      kind: 'stat',
      id: attributes['data-stat-value'],
      ...(hasItem ? { itemId: attributes['data-stat-item'] } : {}),
    });
  } else if (hasItem) {
    references.push({ kind: 'orphanItem', id: attributes['data-stat-item'] });
  }
}

function trackInertMarkerOpen(
  tagName: string,
  attributes: sanitizeHtml.Attributes,
  markerState: InertMarkerState,
) {
  if (tagName !== 'span') {
    return;
  }
  const isInertMarker = hasInertMarkerAttribute(attributes);
  markerState.spanStack.push(isInertMarker);
  if (isInertMarker) {
    markerState.depth += 1;
  }
}

function trackInertMarkerClose(tagName: string, markerState: InertMarkerState) {
  if (tagName !== 'span') {
    return;
  }
  if (markerState.spanStack.pop()) {
    markerState.depth -= 1;
  }
}

function hasInertMarkerAttribute(attributes: sanitizeHtml.Attributes) {
  return (
    attributes['data-stat-value'] !== undefined ||
    attributes['data-interaction-link-target'] !== undefined
  );
}

function createTextFilter(story: Story, markerState: InertMarkerState) {
  return (text: string, tagName: string) =>
    markerState.depth > 0 || tagName === 'button'
      ? text
      : compileStatInterpolationText(text, story);
}

function createTagTransformers(
  story: Story | undefined,
  maps?: NativeStoryIdMaps,
): NonNullable<sanitizeHtml.IOptions['transformTags']> {
  return {
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
    div: (_tagName, attributes) => ({
      tagName: 'div',
      attribs: remapRichTextAttributes(attributes, maps),
    }),
    button: (_tagName, attributes) => ({
      tagName: 'button',
      attribs: remapRichTextAttributes(attributes, maps),
    }),
    span: (_tagName, attributes) =>
      transformSpanTag(remapRichTextAttributes(attributes, maps), story),
  };
}

function remapRichTextAttributes(
  attributes: sanitizeHtml.Attributes,
  maps: NativeStoryIdMaps | undefined,
): sanitizeHtml.Attributes {
  if (!maps) {
    return attributes;
  }
  const result = { ...attributes };
  for (const [attribute, mapping] of [
    ['data-conditional-text-target', maps.interaction],
    ['data-conditional-text-link', maps.interaction],
    ['data-interaction-link-target', maps.interaction],
    ['data-stat-value', maps.statAssignment],
    ['data-stat-item', maps.itemInstance],
  ] as const) {
    if (Object.hasOwn(result, attribute)) {
      const current = result[attribute];
      result[attribute] = mapping?.get(current) ?? current;
    }
  }
  return result;
}

function transformSpanTag(
  attributes: sanitizeHtml.Attributes,
  story: Story | undefined,
): sanitizeHtml.Tag {
  const sanitizedAttributes = { ...attributes };
  const interactionTarget = sanitizedAttributes['data-interaction-link-target'];
  if (isUnknownInteractionTarget(interactionTarget, story)) {
    delete sanitizedAttributes['data-interaction-link-target'];
  }
  return {
    tagName: 'span',
    attribs: hasInertMarkerAttribute(sanitizedAttributes)
      ? { ...sanitizedAttributes, contenteditable: 'false' }
      : sanitizedAttributes,
  };
}

function isUnknownInteractionTarget(target: string | undefined, story: Story | undefined) {
  return Boolean(target && story && !story.interactions.some(({ id }) => id === target));
}

function compileStatInterpolationText(text: string, story: Story): string {
  return text.replace(/\{\{([^{}]*)\}\}/g, (source, escapedExpression: string) => {
    const target = resolveStatInterpolationTarget(story, decodeSanitizedText(escapedExpression));
    if (!target) {
      return source;
    }
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
  if (named !== undefined) {
    return named;
  }
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
