import {
  MAX_COMMENT_QUOTE_LENGTH,
  type CommentTextField,
  type CommentTextSelector,
} from '@paralleax/shared';

export function captureActiveTextSelection():
  { field: CommentTextField; selector: CommentTextSelector } | undefined {
  const selection = window.getSelection();
  if (selection && selection.rangeCount === 1 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const commonElement =
      range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    const surface = commonElement?.closest<HTMLElement>('[data-comment-field]');
    const selectionField = surface?.dataset.commentField as CommentTextField | undefined;
    if (surface && selectionField && surface.contains(range.commonAncestorContainer)) {
      const before = range.cloneRange();
      before.selectNodeContents(surface);
      before.setEnd(range.startContainer, range.startOffset);
      const value = surface.textContent ?? '';
      const start = before.toString().length;
      return makeSelection(value, selectionField, start, start + range.toString().length);
    }
  }

  const active = document.activeElement as HTMLElement | null;
  const field = active?.dataset.commentField as CommentTextField | undefined;
  if (!active || !field) return undefined;

  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? start;
    return makeSelection(active.value, field, start, end);
  }

  if (active.isContentEditable) {
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return undefined;
    const range = selection.getRangeAt(0);
    if (!active.contains(range.commonAncestorContainer)) return undefined;
    const before = range.cloneRange();
    before.selectNodeContents(active);
    before.setEnd(range.startContainer, range.startOffset);
    const value = active.textContent ?? '';
    const start = before.toString().length;
    return makeSelection(value, field, start, start + range.toString().length);
  }
  return undefined;
}

export function makeSelection(value: string, field: CommentTextField, start: number, end: number) {
  const exact = value.slice(start, end);
  if (!exact.trim() || exact.length > MAX_COMMENT_QUOTE_LENGTH) return undefined;
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
