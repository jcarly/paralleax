import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RichTextEditorProps } from '../features/rich-text/richTextEditorTypes';
import { getLoadedTiptapEditor, loadTiptapEditor } from './richTextEditorLoader';

const LazyTiptapRichTextEditor = lazy(async () => ({ default: await loadTiptapEditor() }));

export function RichTextEditor(props: RichTextEditorProps) {
  const { t } = useTranslation();
  // Chosen once per mount: switching from the lazy to the loaded component later
  // would remount Tiptap and lose the text being typed.
  const [TiptapRichTextEditor] = useState(getLoadedTiptapEditor);
  if (TiptapRichTextEditor) {
    return <TiptapRichTextEditor {...props} />;
  }
  return (
    <Suspense
      fallback={
        <div className="rich-text-editor-loading" role="status">
          {t('richText.loading')}
        </div>
      }
    >
      <LazyTiptapRichTextEditor {...props} />
    </Suspense>
  );
}
