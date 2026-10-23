import { useRef, type RefObject } from 'react';

export function useRichTextEditorSelection(editorRef: RefObject<HTMLDivElement | null>) {
  const selectionRef = useRef<Range | undefined>(undefined);

  function rememberSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  }

  function focusAtRememberedSelection() {
    const editor = editorRef.current;
    const range = selectionRef.current;
    editor?.focus();
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function rememberedSelectionText() {
    const editor = editorRef.current;
    const range = selectionRef.current;
    return editor && range && editor.contains(range.commonAncestorContainer)
      ? range.toString().trim()
      : '';
  }

  function rememberedSelectionHtml() {
    const editor = editorRef.current;
    const range = selectionRef.current;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer) || range.collapsed) {
      return '';
    }
    const container = document.createElement('div');
    container.append(range.cloneContents());
    return container.innerHTML;
  }

  function insertInlineConditionalTextFrame(id: string, placeholder: string) {
    const editor = editorRef.current;
    const range = selectionRef.current;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return false;
    const frame = document.createElement('span');
    frame.dataset.conditionalTextBlock = id;
    if (range.collapsed) frame.textContent = placeholder;
    else frame.append(range.extractContents());
    range.insertNode(frame);
    range.setStartAfter(frame);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    selectionRef.current = range.cloneRange();
    return true;
  }

  return {
    focusAtRememberedSelection,
    insertInlineConditionalTextFrame,
    rememberSelection,
    rememberedSelectionHtml,
    rememberedSelectionText,
  };
}
