import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { RichTextEditorProps } from '../features/rich-text/richTextEditorTypes';

const TiptapRichTextEditor = lazy(async () => {
  const module = await import('../features/rich-text/RichTextEditor');
  return { default: module.RichTextEditor };
});

export function RichTextEditor(props: RichTextEditorProps) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="rich-text-editor-loading" role="status">
          {t('richText.loading')}
        </div>
      }
    >
      <TiptapRichTextEditor {...props} />
    </Suspense>
  );
}
