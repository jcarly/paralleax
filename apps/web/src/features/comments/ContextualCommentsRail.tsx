import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { CommentDiscussionCard, CommentDraftCard } from './CommentDiscussionCard';

export function ContextualCommentsRail({
  threads,
  selectedThreadId,
  draftAnchor,
  error,
  canComment,
  canManageThread,
  canDeleteThread = () => false,
  onSelect,
  onCreate,
  onCancelDraft,
  onReply,
  onStatus,
  onDelete,
  onReattach,
  onClose,
}: {
  threads: StoryCommentThread[];
  selectedThreadId?: string;
  draftAnchor?: Exclude<CommentAnchor, { kind: 'canvas' }>;
  error: string;
  canComment: boolean;
  canManageThread: (thread: StoryCommentThread) => boolean;
  canDeleteThread?: (thread: StoryCommentThread) => boolean;
  onSelect: (threadId: string | undefined) => void;
  onCreate: (body: string) => Promise<unknown>;
  onCancelDraft: () => void;
  onReply: (threadId: string, body: string) => Promise<unknown>;
  onStatus: (threadId: string, status: StoryCommentThread['status']) => Promise<unknown>;
  onDelete?: (threadId: string) => Promise<unknown> | void;
  onReattach?: (threadId: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <aside className="contextual-comments-rail" aria-label={t('comments.contextualPanel')}>
      {error ? (
        <p className="comments-error" role="alert">
          {error}
        </p>
      ) : null}
      {draftAnchor ? (
        <CommentDraftCard
          description={anchorDescription(draftAnchor, t)}
          onCreate={onCreate}
          onCancel={onCancelDraft}
        />
      ) : null}
      {threads.map((thread) => (
        <CommentDiscussionCard
          key={thread.id}
          thread={thread}
          expanded={thread.id === selectedThreadId}
          canComment={canComment}
          canManageThread={canManageThread(thread)}
          canDeleteThread={canDeleteThread(thread)}
          onExpand={() => onSelect(thread.id)}
          onCollapse={() => onSelect(undefined)}
          onReply={(body) => onReply(thread.id, body)}
          onStatus={(status) => onStatus(thread.id, status)}
          onDelete={onDelete ? () => onDelete(thread.id) : undefined}
          onReattach={thread.detached && onReattach ? () => onReattach(thread.id) : undefined}
        />
      ))}
    </aside>
  );
}

function anchorDescription(
  anchor: Exclude<CommentAnchor, { kind: 'canvas' }>,
  t: (key: string) => string,
) {
  if (anchor.kind === 'text') return `“${anchor.selector.exact}”`;
  return t(`comments.anchor.${anchor.targetType}`);
}
