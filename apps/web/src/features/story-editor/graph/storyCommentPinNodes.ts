import { useMemo } from 'react';
import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import type { CommentPinFlowNode, CommentPinNodeData } from '../../comments/CommentPinNode';
import type { useStoryComments } from '../../comments/useStoryComments';

export type CommentNodeInput = {
  activeCommentThreads: StoryCommentThread[];
  draftAnchor: CommentAnchor | undefined;
  selectedThreadId: string | undefined;
  canComment: boolean;
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  selectCommentThread: ReturnType<typeof useStoryComments>['selectThread'];
  createComment: ReturnType<typeof useStoryComments>['create'];
  cancelCommentDraft: ReturnType<typeof useStoryComments>['cancelDraft'];
  replyToComment: ReturnType<typeof useStoryComments>['reply'];
  setCommentStatus: ReturnType<typeof useStoryComments>['setStatus'];
  deleteCommentThread: CommentPinNodeData['onDelete'];
  setCommentsOpen: (open: boolean) => void;
};

function isCanvasCommentThread(thread: StoryCommentThread): thread is StoryCommentThread & {
  anchor: Extract<CommentAnchor, { kind: 'canvas' }>;
} {
  return thread.anchor.kind === 'canvas';
}

export function buildCommentPinNodes(input: CommentNodeInput): CommentPinFlowNode[] {
  const threadNodes = input.activeCommentThreads.flatMap((thread) =>
    isCanvasCommentThread(thread) ? [buildCommentThreadPin(thread, input)] : [],
  );
  if (input.draftAnchor?.kind !== 'canvas') {
    return threadNodes;
  }
  return [...threadNodes, buildCommentDraftPin(input.draftAnchor, input)];
}

function buildCommentThreadPin(
  thread: StoryCommentThread & {
    anchor: Extract<CommentAnchor, { kind: 'canvas' }>;
  },
  input: CommentNodeInput,
): CommentPinFlowNode {
  return {
    id: 'comment:' + thread.id,
    type: 'commentPin',
    position: thread.anchor.position,
    draggable: input.canManageCommentThread(thread),
    selectable: false,
    zIndex: 1_000,
    data: {
      thread,
      expanded: thread.id === input.selectedThreadId,
      canComment: input.canComment,
      canManageThread: input.canManageCommentThread(thread),
      canDeleteThread: input.canDeleteCommentThread(thread),
      onOpen: (threadId) => {
        input.selectCommentThread(threadId);
        input.setCommentsOpen(false);
      },
      onCreate: input.createComment,
      onCancelDraft: input.cancelCommentDraft,
      onReply: input.replyToComment,
      onStatus: input.setCommentStatus,
      onDelete: input.deleteCommentThread,
    },
  };
}

function buildCommentDraftPin(
  draftAnchor: Extract<CommentAnchor, { kind: 'canvas' }>,
  input: CommentNodeInput,
): CommentPinFlowNode {
  return {
    id: 'comment:draft',
    type: 'commentPin',
    position: draftAnchor.position,
    draggable: false,
    selectable: false,
    zIndex: 1_001,
    data: {
      draftAnchor,
      expanded: true,
      canComment: input.canComment,
      canManageThread: false,
      canDeleteThread: false,
      onOpen: input.selectCommentThread,
      onCreate: input.createComment,
      onCancelDraft: input.cancelCommentDraft,
      onReply: input.replyToComment,
      onStatus: input.setCommentStatus,
      onDelete: input.deleteCommentThread,
    },
  };
}

export function useStoryEditorCommentPinNodes(input: CommentNodeInput) {
  const {
    activeCommentThreads,
    canDeleteCommentThread,
    canManageCommentThread,
    cancelCommentDraft,
    createComment,
    draftAnchor,
    deleteCommentThread,
    replyToComment,
    selectCommentThread,
    selectedThreadId,
    setCommentStatus,
    setCommentsOpen,
    canComment,
  } = input;
  return useMemo(
    () =>
      buildCommentPinNodes({
        activeCommentThreads,
        canDeleteCommentThread,
        canManageCommentThread,
        cancelCommentDraft,
        createComment,
        draftAnchor,
        deleteCommentThread,
        replyToComment,
        selectCommentThread,
        selectedThreadId,
        setCommentStatus,
        setCommentsOpen,
        canComment,
      }),
    [
      activeCommentThreads,
      canDeleteCommentThread,
      canManageCommentThread,
      cancelCommentDraft,
      createComment,
      draftAnchor,
      deleteCommentThread,
      replyToComment,
      selectCommentThread,
      selectedThreadId,
      setCommentStatus,
      setCommentsOpen,
      canComment,
    ],
  );
}
