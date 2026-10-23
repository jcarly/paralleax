import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRichTextEditorSelection } from './useRichTextEditorSelection';

describe('useRichTextEditorSelection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('remembers, reads, and restores a selection inside the editor', () => {
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.innerHTML = '<p>Before <strong>selected text</strong> after</p>';
    document.body.append(editor);
    const editorRef = createRef<HTMLDivElement>();
    editorRef.current = editor;
    const { result } = renderHook(() => useRichTextEditorSelection(editorRef));
    const range = document.createRange();
    range.selectNode(editor.querySelector('strong')!);
    window.getSelection()!.addRange(range);

    act(() => result.current.rememberSelection());
    window.getSelection()!.removeAllRanges();

    expect(result.current.rememberedSelectionText()).toBe('selected text');
    expect(result.current.rememberedSelectionHtml()).toBe('<strong>selected text</strong>');

    act(() => result.current.focusAtRememberedSelection());
    expect(window.getSelection()?.toString()).toBe('selected text');
  });

  it('wraps the remembered selection in an inline conditional frame', () => {
    const editor = document.createElement('div');
    editor.innerHTML = '<p>Before <em>selected</em> after</p>';
    document.body.append(editor);
    const editorRef = createRef<HTMLDivElement>();
    editorRef.current = editor;
    const { result } = renderHook(() => useRichTextEditorSelection(editorRef));
    const range = document.createRange();
    range.selectNode(editor.querySelector('em')!);
    window.getSelection()!.addRange(range);
    act(() => result.current.rememberSelection());

    expect(result.current.insertInlineConditionalTextFrame('block-1', 'Placeholder')).toBe(true);
    expect(editor.innerHTML).toBe(
      '<p>Before <span data-conditional-text-block="block-1"><em>selected</em></span> after</p>',
    );
  });

  it('does not reuse a selection that belongs to another editor', () => {
    const editor = document.createElement('div');
    const outside = document.createElement('p');
    outside.textContent = 'Outside';
    document.body.append(editor, outside);
    const editorRef = createRef<HTMLDivElement>();
    editorRef.current = editor;
    const { result } = renderHook(() => useRichTextEditorSelection(editorRef));
    const range = document.createRange();
    range.selectNodeContents(outside);
    window.getSelection()!.addRange(range);

    act(() => result.current.rememberSelection());

    expect(result.current.rememberedSelectionText()).toBe('');
    expect(result.current.insertInlineConditionalTextFrame('block-1', 'Placeholder')).toBe(false);
  });
});
