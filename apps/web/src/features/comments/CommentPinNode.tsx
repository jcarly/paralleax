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
  onOpen: (threadId: string) => void;
  onCreate: (body: string) => Promise<unknown>;
  onCancelDraft: () => void;
  onReply: (threadId: string, body: string) => Promise<unknown>;
  onStatus: (threadId: string, status: StoryCommentThread['status']) => Promise<unknown>;
}

export type CommentPinFlowNode = Node<CommentPinNodeData, 'commentPin'>;

export function CommentPinNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const comment = data as CommentPinNodeData;

  return (
    <div
      className="comment-post-it nodrag nopan"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {comment.thread ? (
        <CommentDiscussionCard
          thread={comment.thread}
          expanded={comment.expanded}
          canComment={comment.canComment}
          canManageThread={comment.canManageThread}
          variant="post-it"
          onExpand={() => comment.onOpen(comment.thread!.id)}
          onReply={(body) => comment.onReply(comment.thread!.id, body)}
          onStatus={(status) => comment.onStatus(comment.thread!.id, status)}
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
  );
}
