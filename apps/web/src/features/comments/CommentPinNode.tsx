import type { Node, NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

export interface CommentPinNodeData extends Record<string, unknown> {
  threadId: string;
  messageCount: number;
  resolved: boolean;
  detached?: boolean;
  onOpen: (threadId: string) => void;
}

export type CommentPinFlowNode = Node<CommentPinNodeData, 'commentPin'>;

export function CommentPinNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const comment = data as CommentPinNodeData;
  return (
    <button
      className={`comment-pin nodrag nopan ${comment.resolved ? 'resolved' : ''} ${comment.detached ? 'detached' : ''}`}
      type="button"
      aria-label={t('comments.openPin', { count: comment.messageCount })}
      onClick={(event) => {
        event.stopPropagation();
        comment.onOpen(comment.threadId);
      }}
    >
      <span aria-hidden="true">◆</span>
      <small>{comment.messageCount}</small>
    </button>
  );
}
