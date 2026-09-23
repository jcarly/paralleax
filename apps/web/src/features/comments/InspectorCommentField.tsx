import type { PropsWithChildren } from 'react';
import type { CommentTextField } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';

export interface InspectorTextCommentProps {
  textCommentCounts?: Partial<Record<CommentTextField, number>>;
  onOpenTextComments?: (field: CommentTextField) => void;
}

export function InspectorCommentField({
  field,
  label,
  textCommentCounts,
  onOpenTextComments,
  children,
}: PropsWithChildren<
  InspectorTextCommentProps & {
    field: CommentTextField;
    label: string;
  }
>) {
  const { t } = useTranslation();
  const count = textCommentCounts?.[field] ?? 0;

  return (
    <div className={`inspector-commentable-field ${count > 0 ? 'has-comments' : ''}`}>
      {children}
      {count > 0 && onOpenTextComments ? (
        <button
          className="inspector-field-comment-badge"
          type="button"
          aria-label={t('comments.openForField', { field: label })}
          title={t('comments.openForField', { field: label })}
          onClick={() => onOpenTextComments(field)}
        >
          <span aria-hidden="true">◆</span>
          <span>{count}</span>
        </button>
      ) : null}
    </div>
  );
}
