import type { Editor } from '@tiptap/core';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

type ToolbarAction =
  'bold' | 'italic' | 'underline' | 'heading' | 'bulletList' | 'orderedList' | 'blockquote';
type ToolbarActionConfig = { action: ToolbarAction; label: string; text: string };

type RichTextEditorToolbarProps = {
  editor: Editor | null;
  canAddConditionalText: boolean;
  canAddInteractionLink: boolean;
  canAddVariable: boolean;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddConditionalText: () => void;
  onAddInteractionLink: () => void;
  onAddVariable: () => void;
};

export function RichTextEditorToolbar(props: RichTextEditorToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label={t('richText.formatting')}>
      <FormattingButtons editor={props.editor} t={t} />
      <MediaButtons t={t} onAddImage={props.onAddImage} onAddVideo={props.onAddVideo} />
      <NarrativeButtons {...props} t={t} />
    </div>
  );
}

function FormattingButtons({
  editor,
  t,
}: {
  editor: Editor | null;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <>
      {formattingActions.map((item) => (
        <ToolbarButton
          key={item.action}
          editor={editor}
          action={item.action}
          label={t(item.label)}
          text={item.action === 'bulletList' ? t('richText.list') : item.text}
        />
      ))}
    </>
  );
}

function MediaButtons({
  t,
  onAddImage,
  onAddVideo,
}: {
  t: ReturnType<typeof useTranslation>['t'];
  onAddImage: () => void;
  onAddVideo: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={t('richText.addImage')}
        title={t('richText.addImage')}
        onMouseDown={keepEditorFocus}
        onClick={onAddImage}
      >
        {t('richText.image')}
      </button>
      <button
        type="button"
        aria-label={t('richText.addVideo')}
        title={t('richText.addVideo')}
        onMouseDown={keepEditorFocus}
        onClick={onAddVideo}
      >
        {t('richText.video')}
      </button>
    </>
  );
}

function NarrativeButtons(
  props: RichTextEditorToolbarProps & { t: ReturnType<typeof useTranslation>['t'] },
) {
  return (
    <>
      <ActionButton
        label={props.t('richText.addConditionalText')}
        enabled={props.canAddConditionalText}
        onClick={props.onAddConditionalText}
      >
        [?]
      </ActionButton>
      <ActionButton
        label={props.t('richText.addInteractionLink')}
        enabled={props.canAddInteractionLink}
        onClick={props.onAddInteractionLink}
      >
        🔗
      </ActionButton>
      <ActionButton
        label={props.t('richText.addVariable')}
        enabled={props.canAddVariable}
        onClick={props.onAddVariable}
      >
        {'{x}'}
      </ActionButton>
    </>
  );
}

const formattingActions: ToolbarActionConfig[] = [
  { action: 'bold', label: 'richText.bold', text: 'B' },
  { action: 'italic', label: 'richText.italic', text: 'I' },
  { action: 'underline', label: 'richText.underline', text: 'U' },
  { action: 'heading', label: 'richText.heading', text: 'H2' },
  { action: 'bulletList', label: 'richText.bulletedList', text: '•' },
  { action: 'orderedList', label: 'richText.numberedList', text: '1.' },
  { action: 'blockquote', label: 'richText.blockquote', text: '❞' },
];

function ToolbarButton({
  editor,
  action,
  label,
  text,
}: {
  editor: Editor | null;
  action: ToolbarAction;
  label: string;
  text: string;
}) {
  const active = Boolean(editor && isActionActive(editor, action));
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={active ? 'rich-text-toolbar-button is-active' : 'rich-text-toolbar-button'}
      disabled={!editor}
      onMouseDown={keepEditorFocus}
      onClick={() => {
        if (editor) {
          applyAction(editor, action);
        }
      }}
    >
      {text}
    </button>
  );
}

function ActionButton({
  label,
  enabled,
  onClick,
  children,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onMouseDown={keepEditorFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function applyAction(editor: Editor, action: ToolbarAction) {
  const chain = editor.chain().focus();
  switch (action) {
    case 'bold':
      chain.toggleBold().run();
      break;
    case 'italic':
      chain.toggleItalic().run();
      break;
    case 'underline':
      chain.toggleUnderline().run();
      break;
    case 'heading':
      chain.toggleHeading({ level: 2 }).run();
      break;
    case 'bulletList':
      chain.toggleBulletList().run();
      break;
    case 'orderedList':
      chain.toggleOrderedList().run();
      break;
    case 'blockquote':
      chain.toggleBlockquote().run();
      break;
  }
}

function isActionActive(editor: Editor, action: ToolbarAction) {
  if (action === 'heading') {
    return editor.isActive('heading', { level: 2 });
  }
  return editor.isActive(action);
}

function keepEditorFocus(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}
