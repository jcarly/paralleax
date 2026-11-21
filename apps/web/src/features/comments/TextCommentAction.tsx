import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTextCommentSelection, type TextCommentSelection } from './useTextCommentSelection';

/** The comment-on-selected-text action, shown only while commentable text is selected. */
export function TextCommentAction({
  onStart,
}: {
  onStart: (selection: TextCommentSelection) => void;
}) {
  const { t } = useTranslation();
  const actionRef = useRef<HTMLButtonElement>(null);
  const [selection, clearSelection] = useTextCommentSelection(actionRef);
  if (!selection) {
    return null;
  }
  return (
    <button
      className="ghost"
      ref={actionRef}
      type="button"
      title={t('comments.commentSelectedText')}
      aria-label={t('comments.commentSelectedText')}
      onMouseDown={(event) => {
        // Keep the text selected while the pointer presses the action.
        event.preventDefault();
      }}
      onClick={() => {
        onStart(selection);
        clearSelection();
      }}
    >
      <span aria-hidden="true">✎</span>
    </button>
  );
}
