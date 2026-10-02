import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import type { Node, NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { CommentDiscussionCard, CommentDraftCard } from './CommentDiscussionCard';

export interface CommentPinNodeData extends Record<string, unknown> {
  thread?: StoryCommentThread;
  draftAnchor?: Extract<CommentAnchor, { kind: 'canvas' }>;
  expanded: boolean;
  canComment: boolean;
  canManageThread: boolean;
  canDeleteThread: boolean;
  onOpen: (threadId: string) => void;
  onCreate: (body: string) => Promise<unknown>;
  onCancelDraft: () => void;
  onReply: (threadId: string, body: string) => Promise<unknown>;
  onStatus: (threadId: string, status: StoryCommentThread['status']) => Promise<unknown>;
  onDelete: (threadId: string) => Promise<unknown> | void;
}

export type CommentPinFlowNode = Node<CommentPinNodeData, 'commentPin'>;

export function CommentPinNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const comment = data as CommentPinNodeData;

  return (
    <div className="comment-post-it" onClick={(event) => event.stopPropagation()}>
      {comment.thread && comment.canManageThread ? (
        <div className="comment-post-it-drag-handle" title={t('comments.movePostIt')}>
          <span aria-hidden="true">⠿</span>
        </div>
      ) : null}
      <div
        className="comment-post-it-content nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {comment.thread ? (
          <CommentDiscussionCard
            thread={comment.thread}
            expanded={comment.expanded}
            canComment={comment.canComment}
            canManageThread={comment.canManageThread}
            canDeleteThread={comment.canDeleteThread}
            variant="post-it"
            onExpand={() => comment.onOpen(comment.thread!.id)}
            onReply={(body) => comment.onReply(comment.thread!.id, body)}
            onStatus={(status) => comment.onStatus(comment.thread!.id, status)}
            onDelete={() => comment.onDelete(comment.thread!.id)}
          />
        ) : comment.draftAnchor ? (
          <CommentDraftCard
            description={t('comments.anchor.canvas')}
            variant="post-it"
            onCreate={comment.onCreate}
            onCancel={comment.onCancelDraft}
          />
        ) : null}
      </div>
    </div>
  );
}
