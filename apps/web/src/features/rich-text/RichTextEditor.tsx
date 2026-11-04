import { EditorContent } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import type { RichTextEditorProps } from './richTextEditorTypes';
import { RichTextEditorDialogs } from './RichTextEditorDialogs';
import { RichTextEditorToolbar } from './RichTextEditorToolbar';
import { useRichTextEditor } from './useRichTextEditor';
import '../../components/richTextEditor.css';

export function RichTextEditor(props: RichTextEditorProps) {
  const editor = useRichTextEditor(props);
  return (
    <div
      className={`rich-text-editor${props.revealToolbarOnFocus ? ' rich-text-editor--focus-revealed' : ''}`}
      onClickCapture={editor.clickCapture}
    >
      <RichTextEditorToolbar
        editor={editor.editor}
        canAddConditionalText={Boolean(
          props.story && props.interactionId && !editor.compatibilityError,
        )}
        canAddInteractionLink={Boolean(
          props.interactionLinkTargets?.length && !editor.compatibilityError,
        )}
        canAddVariable={editor.hasVariables && !editor.compatibilityError}
        onAddImage={editor.insertImage}
        onAddVideo={editor.insertVideo}
        onAddConditionalText={editor.openConditionalFrame}
        onAddInteractionLink={editor.openLinkDialog}
        onAddVariable={editor.openVariableDialog}
      />
      <EditorContent className="rich-text-surface" editor={editor.editor} />
      <EditorStatus {...editor} value={props.value} />
      <RichTextEditorDialogs
        editor={editor.editor}
        story={props.story}
        interactionId={props.interactionId}
        interactionLinkTargets={props.interactionLinkTargets ?? []}
        editingVariable={editor.editingVariable}
        editingLink={editor.editingLink}
        linkSelectionText={editor.linkSelectionText}
        conditionalEdit={editor.conditionalEdit}
        currentCondition={editor.currentCondition}
        onCancelVariable={() => editor.setEditingVariable(undefined)}
        onConfirmVariable={editor.addVariable}
        onCancelLink={editor.cancelLinkDialog}
        onConfirmLink={editor.addInteractionLink}
        onCancelCondition={() => editor.setConditionalEdit(undefined)}
        onConfirmCondition={editor.confirmCondition}
      />
    </div>
  );
}

function EditorStatus({
  compatibilityError,
  limitMessage,
  nearLimit,
  remainingCharacters,
  value,
}: ReturnType<typeof useRichTextEditor> & { value: string }) {
  const { t } = useTranslation();
  return (
    <>
      {compatibilityError ? (
        <div className="rich-text-diagnostic" role="alert">
          <strong>{t('richText.incompatibleContent')}</strong>
          <span>{compatibilityError}</span>
          <pre>{value}</pre>
        </div>
      ) : null}
      <p
        aria-label={t('richText.contentLength')}
        className={`rich-text-limit${remainingCharacters < 0 ? ' error' : nearLimit ? ' warning' : ''}`}
        role="status"
      >
        <span>{limitMessage}</span>
        <span className="sr-only">{t('richText.contentLength')}</span>
      </p>
    </>
  );
}
