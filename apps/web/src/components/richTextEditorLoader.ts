import type { ComponentType } from 'react';
import type { RichTextEditorProps } from '../features/rich-text/richTextEditorTypes';

let loadedTiptapEditor: ComponentType<RichTextEditorProps> | undefined;

export async function loadTiptapEditor() {
  const module = await import('../features/rich-text/RichTextEditor');
  loadedTiptapEditor = module.RichTextEditor;
  return module.RichTextEditor;
}

/** The Tiptap editor component, once its chunk has been loaded. */
export function getLoadedTiptapEditor() {
  return loadedTiptapEditor;
}

/**
 * Loads the Tiptap editor chunk ahead of the first edit. The chunk stays out of the
 * initial bundle; callers run this when idle. Once loaded, the editor renders
 * directly, without the Suspense fallback that React.lazy shows on first use.
 */
export async function preloadRichTextEditor(): Promise<void> {
  await loadTiptapEditor();
}
