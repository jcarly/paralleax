import {
  MAX_COMMENT_QUOTE_LENGTH,
  type CommentTextField,
  type CommentTextSelector,
} from '@paralleax/shared';

const commentFields: ReadonlySet<string> = new Set(['title', 'body', 'description', 'name']);

export function captureActiveTextSelection():
  { field: CommentTextField; selector: CommentTextSelector } | undefined {
  const selection = window.getSelection();
  const rangeSelection = captureRangeSelection(selection);
  if (rangeSelection) {
    return rangeSelection;
  }
  return captureFocusedField(selection);
}

function captureRangeSelection(selection: Selection | null) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
    return undefined;
  }
  return captureDomRange(selection.getRangeAt(0));
}

function captureDomRange(range: Range) {
  const common = range.commonAncestorContainer;
  const commonElement = common instanceof HTMLElement ? common : common.parentElement;
  const surface = commonElement?.closest<HTMLElement>('[data-comment-field]');
  const fieldValue = surface?.dataset.commentField;
  if (!surface || !isCommentTextField(fieldValue) || !surface.contains(common)) {
    return undefined;
  }
  const text = commentableText(surface);
  const start = commentableOffset(surface, range.startContainer, range.startOffset);
  const end = commentableOffset(surface, range.endContainer, range.endOffset);
  return start === undefined || end === undefined
    ? undefined
    : makeSelection(text, fieldValue, start, end);
}

function captureFocusedField(selection: Selection | null) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !isCommentTextField(active.dataset.commentField)) {
    return undefined;
  }
  const field = active.dataset.commentField;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return captureInputSelection(active, field);
  }
  return active.isContentEditable ? captureEditableSelection(active, selection, field) : undefined;
}

function captureInputSelection(
  active: HTMLInputElement | HTMLTextAreaElement,
  field: CommentTextField,
) {
  const start = active.selectionStart ?? 0;
  const end = active.selectionEnd ?? start;
  return makeSelection(active.value, field, start, end);
}

function captureEditableSelection(
  active: HTMLElement,
  selection: Selection | null,
  field: CommentTextField,
) {
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  if (!active.contains(range.commonAncestorContainer)) {
    return undefined;
  }
  const text = commentableText(active);
  const start = commentableOffset(active, range.startContainer, range.startOffset);
  const end = commentableOffset(active, range.endContainer, range.endOffset);
  return start === undefined || end === undefined
    ? undefined
    : makeSelection(text, field, start, end);
}

function isCommentTextField(value: string | undefined): value is CommentTextField {
  return value !== undefined && commentFields.has(value);
}

function commentableText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes, commentableText).join('');
  }
  if (node.hasAttribute('data-comment-exclude')) {
    return '';
  }
  if (node.hasAttribute('data-comment-value')) {
    return node.dataset.commentValue ?? '';
  }
  return Array.from(node.childNodes, commentableText).join('');
}

function commentableOffset(
  surface: HTMLElement,
  container: Node,
  offset: number,
): number | undefined {
  const scan: OffsetScan = { container, offset, length: 0 };
  scanCommentableOffset(surface, scan);
  return scan.result;
}

type OffsetScan = { container: Node; offset: number; length: number; result?: number };

function scanCommentableOffset(node: Node, scan: OffsetScan): boolean {
  if (isExcluded(node)) {
    return false;
  }
  if (node === scan.container) {
    scan.result = localCommentableOffset(node, scan.offset, scan.length);
    return true;
  }
  if (isCommentValue(node)) {
    if (node.contains(scan.container)) {
      scan.result = scan.length + (scan.offset > 0 ? commentableText(node).length : 0);
      return true;
    }
    scan.length += commentableText(node).length;
    return false;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    scan.length += node.textContent?.length ?? 0;
    return false;
  }
  for (const child of Array.from(node.childNodes)) {
    if (scanCommentableOffset(child, scan)) {
      return true;
    }
  }
  return false;
}

function localCommentableOffset(node: Node, offset: number, length: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return length + Math.min(Math.max(offset, 0), node.textContent?.length ?? 0);
  }
  if (isCommentValue(node)) {
    return length + (offset > 0 ? commentableText(node).length : 0);
  }
  return (
    length +
    Array.from(node.childNodes)
      .slice(0, Math.min(Math.max(offset, 0), node.childNodes.length))
      .reduce((total, child) => total + commentableText(child).length, 0)
  );
}

function isExcluded(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute('data-comment-exclude');
}

function isCommentValue(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.hasAttribute('data-comment-value');
}

export function makeSelection(value: string, field: CommentTextField, start: number, end: number) {
  const exact = value.slice(start, end);
  if (!exact.trim() || exact.length > MAX_COMMENT_QUOTE_LENGTH) {
    return undefined;
  }
  return {
    field,
    selector: {
      exact,
      prefix: value.slice(Math.max(0, start - 64), start),
      suffix: value.slice(end, end + 64),
      start,
      end,
      sourceHash: hashText(value),
    },
  };
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
