import { generateHTML, generateJSON, type JSONContent } from '@tiptap/core';
import type { ConditionalTextBlock, Story } from '@paralleax/shared';
import type { Extensions } from '@tiptap/core';
import { getStatTargets } from '@paralleax/shared';
import { sanitizeRichTextForDisplay } from '../../rich-text';

export type RichTextSourceDiagnostic = {
  from: number;
  to: number;
  message: string;
};

export type RichTextSourceValidation =
  | { ok: true; html: string; document: JSONContent }
  | { ok: false; diagnostics: RichTextSourceDiagnostic[] };

export type RichTextSourceInput = {
  source: string;
  extensions: Extensions;
  story?: Story;
  conditionalTextBlocks: ConditionalTextBlock[];
  baselineHtml?: string;
};

const allowedTags = new Set([
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
]);

const allowedAttributes: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt']),
  video: new Set(['src', 'controls', 'poster']),
  source: new Set(['src', 'type']),
  iframe: new Set(['src', 'title', 'allow', 'allowfullscreen']),
  div: new Set(['data-conditional-text-target', 'data-conditional-text-block']),
  button: new Set(['type', 'contenteditable', 'aria-label', 'data-conditional-text-link']),
  span: new Set([
    'contenteditable',
    'data-conditional-text-block',
    'data-stat-value',
    'data-stat-item',
    'data-interaction-link-target',
  ]),
  p: new Set(),
  br: new Set(),
  strong: new Set(),
  em: new Set(),
  u: new Set(),
  s: new Set(),
  h2: new Set(),
  h3: new Set(),
  blockquote: new Set(),
  ul: new Set(),
  ol: new Set(),
  li: new Set(),
};

const iframeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
]);

export function validateRichTextSource({
  source,
  extensions,
  story,
  conditionalTextBlocks,
  baselineHtml = source,
}: RichTextSourceInput): RichTextSourceValidation {
  const sourceIssues = validateAllowedMarkup(source);
  if (sourceIssues.length) {
    return { ok: false, diagnostics: sourceIssues };
  }

  let safeHtml: string;
  let document: JSONContent;
  let html: string;
  try {
    safeHtml = sanitizeRichTextForDisplay(source);
    document = generateJSON(safeHtml, extensions);
    html = generateHTML(document, extensions);
  } catch {
    return {
      ok: false,
      diagnostics: [diagnosticAt(source, 0, 'The HTML could not be parsed by the visual editor.')],
    };
  }

  if (markupFingerprint(safeHtml) !== markupFingerprint(html)) {
    return {
      ok: false,
      diagnostics: [
        diagnosticAt(source, 0, 'The visual editor would change or remove supported HTML.'),
      ],
    };
  }

  const narrativeIssues = validateNarrativeReferences(
    source,
    baselineHtml,
    story,
    conditionalTextBlocks,
  );
  if (narrativeIssues.length) {
    return { ok: false, diagnostics: narrativeIssues };
  }
  return { ok: true, html, document };
}

function validateAllowedMarkup(source: string): RichTextSourceDiagnostic[] {
  const template = document.createElement('template');
  template.innerHTML = source;
  return Array.from(template.content.querySelectorAll('*')).flatMap((element) =>
    validateMarkupElement(source, element),
  );
}

function validateMarkupElement(source: string, element: Element): RichTextSourceDiagnostic[] {
  const tag = element.tagName.toLocaleLowerCase();
  if (!allowedTags.has(tag)) {
    return [
      diagnosticAt(source, elementOffset(source, element), `The <${tag}> tag is not supported.`),
    ];
  }
  return [
    ...validateElementAttributes(source, tag, element),
    ...validateElementUrls(source, tag, element),
    ...validateIframeHost(source, tag, element),
    ...validateSpecialElement(source, tag, element),
  ];
}

function validateElementAttributes(source: string, tag: string, element: Element) {
  const permitted = allowedAttributes[tag] ?? new Set<string>();
  return Array.from(element.attributes).flatMap((attribute) => {
    const name = attribute.name.toLocaleLowerCase();
    return permitted.has(name)
      ? []
      : [
          diagnosticAt(
            source,
            elementOffset(source, element),
            `The ${name} attribute is not supported on <${tag}>.`,
          ),
        ];
  });
}

function validateElementUrls(source: string, tag: string, element: Element) {
  return ['href', 'src', 'poster'].flatMap((name) => {
    const value = element.getAttribute(name);
    return !value || isAllowedUrl(tag, name, value)
      ? []
      : [diagnosticAt(source, elementOffset(source, element), `The ${name} URL is not allowed.`)];
  });
}

function validateIframeHost(source: string, tag: string, element: Element) {
  if (tag !== 'iframe') {
    return [];
  }
  try {
    const host = new URL(element.getAttribute('src') ?? '').hostname;
    return iframeHosts.has(host)
      ? []
      : [
          diagnosticAt(
            source,
            elementOffset(source, element),
            'The embedded video host is not allowed.',
          ),
        ];
  } catch {
    return [
      diagnosticAt(source, elementOffset(source, element), 'The embedded video URL is invalid.'),
    ];
  }
}

function validateSpecialElement(source: string, tag: string, element: Element) {
  if (tag === 'button' && !element.hasAttribute('data-conditional-text-link')) {
    return [
      diagnosticAt(
        source,
        elementOffset(source, element),
        'Only legacy conditional links can use <button>.',
      ),
    ];
  }
  if (tag === 'source' && !element.closest('video')) {
    return [
      diagnosticAt(source, elementOffset(source, element), '<source> must be inside <video>.'),
    ];
  }
  return [];
}

function isAllowedUrl(tag: string, attribute: string, value: string): boolean {
  try {
    const url = new URL(value, document.baseURI);
    if (tag === 'iframe') {
      return url.protocol === 'https:';
    }
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateNarrativeReferences(
  source: string,
  baselineHtml: string,
  story: Story | undefined,
  conditionalTextBlocks: ConditionalTextBlock[],
): RichTextSourceDiagnostic[] {
  const sourceRoot = parseFragment(source);
  const baselineRoot = parseFragment(baselineHtml);
  const recordIds = new Set(conditionalTextBlocks.map(({ id }) => id));
  return [
    ...conditionalBlockDiagnostics(source, baselineRoot, sourceRoot, recordIds),
    ...narrativeReferenceDiagnostics(source, baselineRoot, sourceRoot, story),
  ];
}

function conditionalBlockDiagnostics(
  source: string,
  baselineRoot: ParentNode,
  sourceRoot: ParentNode,
  recordIds: ReadonlySet<string>,
) {
  const baselineBlocks = markerValues(
    baselineRoot,
    '[data-conditional-text-block]',
    'data-conditional-text-block',
  );
  const candidateBlocks = markerValues(
    sourceRoot,
    '[data-conditional-text-block]',
    'data-conditional-text-block',
  );
  const baselineCounts = countValues(baselineBlocks);
  const candidateCounts = countValues(candidateBlocks);
  return [
    ...newBlockDiagnostics(source, candidateCounts, baselineCounts, recordIds),
    ...removedBlockDiagnostics(source, baselineCounts, candidateCounts, recordIds),
  ];
}

function newBlockDiagnostics(
  source: string,
  candidateCounts: ReadonlyMap<string, number>,
  baselineCounts: ReadonlyMap<string, number>,
  recordIds: ReadonlySet<string>,
) {
  const diagnostics: RichTextSourceDiagnostic[] = [];
  for (const [id, count] of candidateCounts) {
    if (count > 1) {
      diagnostics.push(
        diagnosticAt(
          source,
          markerOffset(source, 'data-conditional-text-block', id),
          `Conditional block id "${id}" appears more than once.`,
        ),
      );
    }
    if (!recordIds.has(id) && !baselineCounts.has(id)) {
      diagnostics.push(
        diagnosticAt(
          source,
          markerOffset(source, 'data-conditional-text-block', id),
          `Conditional block "${id}" has no canonical condition record.`,
        ),
      );
    }
  }
  return diagnostics;
}

function removedBlockDiagnostics(
  source: string,
  baselineCounts: ReadonlyMap<string, number>,
  candidateCounts: ReadonlyMap<string, number>,
  recordIds: ReadonlySet<string>,
) {
  const diagnostics: RichTextSourceDiagnostic[] = [];
  for (const [id, count] of baselineCounts) {
    if ((candidateCounts.get(id) ?? 0) < count && recordIds.has(id)) {
      diagnostics.push(
        diagnosticAt(source, 0, `Conditional block "${id}" cannot be removed from HTML source.`),
      );
    }
  }
  return diagnostics;
}

function narrativeReferenceDiagnostics(
  source: string,
  baselineRoot: ParentNode,
  sourceRoot: ParentNode,
  story: Story | undefined,
) {
  const targetIds = story ? new Set(story.interactions.map(({ id }) => id)) : new Set<string>();
  const baselineRefs = narrativeReferenceCounts(baselineRoot);
  const candidateRefs = narrativeReferenceCounts(sourceRoot);
  return [
    ...newNarrativeReferenceDiagnostics({ source, candidateRefs, baselineRefs, targetIds, story }),
    ...removedNarrativeReferenceDiagnostics(source, baselineRefs, candidateRefs),
  ];
}

function newNarrativeReferenceDiagnostics({
  source,
  candidateRefs,
  baselineRefs,
  targetIds,
  story,
}: {
  source: string;
  candidateRefs: ReadonlyMap<string, number>;
  baselineRefs: ReadonlyMap<string, number>;
  targetIds: ReadonlySet<string>;
  story: Story | undefined;
}) {
  const diagnostics: RichTextSourceDiagnostic[] = [];
  for (const [reference, count] of candidateRefs) {
    const [kind, id, itemId = ''] = reference.split('|');
    if (
      !isNarrativeReferenceKnown({ kind, id, itemId, targetIds, story }) &&
      (baselineRefs.get(reference) ?? 0) < count
    ) {
      diagnostics.push(
        diagnosticAt(
          source,
          markerOffset(source, referenceAttribute(kind), id),
          `The ${referenceLabel(kind)} reference "${id}" is not available in this story.`,
        ),
      );
    }
  }
  return diagnostics;
}

function removedNarrativeReferenceDiagnostics(
  source: string,
  baselineRefs: ReadonlyMap<string, number>,
  candidateRefs: ReadonlyMap<string, number>,
) {
  const diagnostics: RichTextSourceDiagnostic[] = [];
  for (const [reference, count] of baselineRefs) {
    if ((candidateRefs.get(reference) ?? 0) < count) {
      diagnostics.push(
        diagnosticAt(source, 0, 'Existing narrative references cannot be removed in HTML source.'),
      );
    }
  }
  return diagnostics;
}

function isNarrativeReferenceKnown({
  kind,
  id,
  itemId,
  targetIds,
  story,
}: {
  kind: string | undefined;
  id: string | undefined;
  itemId: string;
  targetIds: ReadonlySet<string>;
  story: Story | undefined;
}) {
  if (kind !== 'stat') {
    return targetIds.has(id ?? '');
  }
  return Boolean(
    story &&
    getStatTargets(story).some(
      (target) => target.assignment.id === id && (target.itemId ?? '') === itemId,
    ),
  );
}

function referenceAttribute(kind: string | undefined) {
  return kind === 'stat' ? 'data-stat-value' : 'data-interaction-link-target';
}

function referenceLabel(kind: string | undefined) {
  return kind === 'stat' ? 'variable' : 'interaction';
}

function narrativeReferenceCounts(root: ParentNode): Map<string, number> {
  const result = new Map<string, number>();
  root
    .querySelectorAll<HTMLElement>(
      '[data-stat-value], [data-interaction-link-target], [data-conditional-text-target], [data-conditional-text-link]',
    )
    .forEach((element) => {
      let reference: string | undefined;
      if (element.hasAttribute('data-stat-value')) {
        reference = `stat|${element.getAttribute('data-stat-value') ?? ''}|${element.getAttribute('data-stat-item') ?? ''}`;
      } else if (element.hasAttribute('data-interaction-link-target')) {
        reference = `interaction|${element.getAttribute('data-interaction-link-target') ?? ''}`;
      } else {
        reference = `interaction|${element.getAttribute('data-conditional-text-target') ?? element.getAttribute('data-conditional-text-link') ?? ''}`;
      }
      result.set(reference, (result.get(reference) ?? 0) + 1);
    });
  return result;
}

function markupFingerprint(html: string): string {
  const root = parseFragment(html);
  const walk = (node: Node): unknown => {
    if (node.nodeType === Node.TEXT_NODE) {
      return ['text', node.textContent ?? ''];
    }
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const tag = node.tagName.toLocaleLowerCase();
    const attributes = Array.from(node.attributes)
      .filter(
        ({ name }) => !['contenteditable', 'target', 'rel', 'controls', 'type'].includes(name),
      )
      .map(({ name, value }) => [name, value])
      .sort(([left], [right]) => String(left).localeCompare(String(right)));
    return [tag, attributes, Array.from(node.childNodes).map(walk)];
  };
  const blocks: unknown[] = [];
  let inlineContent: unknown[] = [];
  const flushInlineContent = () => {
    if (!inlineContent.length) {
      return;
    }
    blocks.push(['p', [], inlineContent]);
    inlineContent = [];
  };
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim()) {
      continue;
    }
    if (
      node instanceof HTMLElement &&
      ['p', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'div'].includes(node.tagName.toLocaleLowerCase())
    ) {
      flushInlineContent();
      blocks.push(walk(node));
    } else {
      inlineContent.push(walk(node));
    }
  }
  flushInlineContent();
  if (!blocks.length) {
    blocks.push(['p', [], []]);
  }
  return JSON.stringify(blocks);
}

function parseFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function markerValues(root: ParentNode, selector: string, attribute: string): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(selector),
    (element) => element.getAttribute(attribute) ?? '',
  );
}

function countValues(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}

function markerOffset(source: string, attribute: string, value: string): number {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Math.max(
    0,
    source.search(new RegExp(`<[^>]*\\b${attribute}=["']${escapedValue}["']`, 'i')),
  );
}

function elementOffset(source: string, element: Element): number {
  const tag = element.tagName.toLocaleLowerCase();
  const pattern = new RegExp(`<${tag}(?:\\s|>)`, 'i');
  return Math.max(0, source.search(pattern));
}

function diagnosticAt(source: string, offset: number, message: string): RichTextSourceDiagnostic {
  const from = Math.min(Math.max(offset, 0), source.length);
  const lineStart = source.lastIndexOf('\n', from - 1) + 1;
  const lineEnd = source.indexOf('\n', from);
  return { from: lineStart, to: lineEnd < 0 ? source.length : lineEnd, message };
}
