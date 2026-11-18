import {
  useCallback,
  type Dispatch,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { useTranslation } from 'react-i18next';
import type { ReactFlowInstance } from '@xyflow/react';
import type { Story, StoryCommentThread } from '@paralleax/shared';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { StoryGraphSelection } from '../../../storyGraphSelection';
import { bindStoryEditorCommentActions } from '../../comments/storyEditorCommentActions';
import type { useStoryComments } from '../../comments/useStoryComments';
import type {
  useStoryEditorCommentProjection,
  useStoryEditorCommentSummary,
} from '../../comments/useStoryEditorCommentProjection';
import type { buildGraphDecorationNodes } from '../../graph-decorations/graphDecorationNodes';
import type {
  useStoryEditorSelection,
  StoryEditorExclusiveSelection,
} from '../selection/useStoryEditorSelection';
import { useStoryEditorCommentPinNodes } from './storyCommentPinNodes';
import {
  selectStoryFlowNode,
  useStoryEditorPointerActions,
  type CanvasContextMenuState,
} from './storyEditorPointerActions';
import {
  useStoryEditorCommentDeletionActions,
  useStoryEditorCommentFocusActions,
  useStoryEditorCommentTargetActions,
} from './useStoryEditorCommentNavigation';
import { useStoryEditorFlowNodeSynchronization } from './useStoryEditorFlowSynchronization';

type StoryEditorCanvasCommentNodesInput = {
  story?: Story;
  comments: ReturnType<typeof useStoryComments>;
  activeCommentThreads: StoryCommentThread[];
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  deleteCommentThread: ReturnType<
    typeof useStoryEditorCommentDeletionActions
  >['deleteCommentThread'];
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  reviewOnly: boolean;
  decorationNodes: ReturnType<typeof buildGraphDecorationNodes>;
  narrativeNodes: StoryFlowNode[];
  setNodes: Dispatch<SetStateAction<StoryFlowNode[]>>;
  nodes: StoryFlowNode[];
  pendingFocusInteractionId?: string;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
};

export function useStoryEditorCanvasCommentNodes(input: StoryEditorCanvasCommentNodesInput) {
  const commentNodes = useStoryEditorCommentPinNodes({
    activeCommentThreads: input.activeCommentThreads,
    draftAnchor: input.comments.draftAnchor,
    selectedThreadId: input.comments.selectedThreadId,
    canComment: input.story?.capabilities?.canComment === true,
    canManageCommentThread: input.canManageCommentThread,
    canDeleteCommentThread: input.canDeleteCommentThread,
    selectCommentThread: input.comments.selectThread,
    createComment: input.comments.create,
    cancelCommentDraft: input.comments.cancelDraft,
    replyToComment: input.comments.reply,
    setCommentStatus: input.comments.setStatus,
    deleteCommentThread: input.deleteCommentThread,
    setCommentsOpen: input.setCommentsOpen,
  });
  useStoryEditorFlowNodeSynchronization({
    decorationNodes: input.decorationNodes,
    narrativeNodes: input.narrativeNodes,
    commentNodes,
    reviewOnly: input.reviewOnly,
    setNodes: input.setNodes,
    nodes: input.nodes,
    pendingFocusInteractionId: input.pendingFocusInteractionId,
    setPendingFocusInteractionId: input.setPendingFocusInteractionId,
    flowInstanceRef: input.flowInstanceRef,
  });
  return commentNodes;
}

type StoryEditorCommentEntryActionsInput = {
  story?: Story;
  reviewOnly: boolean;
  placingComment: boolean;
  commentsOpen: boolean;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  comments: ReturnType<typeof useStoryComments>;
  selectedCommentTarget?: ReturnType<typeof useStoryEditorSelection>['selectedCommentTarget'];
  selectedCommentTargetKey?: string;
  selectedTargetThreads: StoryCommentThread[];
  showContextualComments: boolean;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  closeInspector: () => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

function useStoryEditorCommentEntryActions(input: StoryEditorCommentEntryActionsInput) {
  const commentActions = bindStoryEditorCommentActions({
    story: input.story,
    comments: input.comments,
    selectedCommentTarget: input.selectedCommentTarget,
    selectedCommentTargetKey: input.selectedCommentTargetKey,
    selectedTargetThreads: input.selectedTargetThreads,
    showContextualComments: input.showContextualComments,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
  });
  const pointerActions = useStoryEditorPointerActions({
    story: input.story,
    reviewOnly: input.reviewOnly,
    placingComment: input.placingComment,
    commentsOpen: input.commentsOpen,
    getFlowInstance: input.getFlowInstance,
    selectCommentThread: input.comments.selectThread,
    setCanvasContextMenu: input.setCanvasContextMenu,
    setPlacingComment: input.setPlacingComment,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    startCommentThread: input.comments.startThread,
    closeInspector: input.closeInspector,
    selectExclusive: input.selectExclusive,
    cancelCommentDraft: input.comments.cancelDraft,
  });
  return { commentActions, pointerActions };
}

type StoryEditorCommentActionsRuntimeInput = {
  t: ReturnType<typeof useTranslation>['t'];
  story?: Story;
  comments: ReturnType<typeof useStoryComments>;
  commentProjection: ReturnType<typeof useStoryEditorCommentProjection>;
  commentSummary: ReturnType<typeof useStoryEditorCommentSummary>;
  selectedCommentTarget?: ReturnType<typeof useStoryEditorSelection>['selectedCommentTarget'];
  closeInspector: () => void;
  selectEditorExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  reviewOnly: boolean;
  commentsOpen: boolean;
  placingComment: boolean;
};

export function useStoryEditorCommentActionsRuntime(input: StoryEditorCommentActionsRuntimeInput) {
  const focusCommentThread = useStoryEditorCommentFocusActions({
    threads: input.commentProjection.projectedCommentThreads,
    story: input.story,
    selectCommentThread: input.comments.selectThread,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    closeInspector: input.closeInspector,
    selectEditorExclusive: input.selectEditorExclusive,
    getFlowInstance: input.getFlowInstance,
  });
  const openCommentsForTarget = useStoryEditorCommentTargetActions({
    activeThreads: input.commentProjection.activeCommentThreads,
    story: input.story,
    selectCommentThread: input.comments.selectThread,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    selectEditorExclusive: input.selectEditorExclusive,
    closeInspector: input.closeInspector,
  });
  const deletion = useStoryEditorCommentDeletionActions(
    input.t,
    input.comments,
    input.comments.selectThread,
    input.setContextualCommentsTargetKey,
  );
  const entryActions = useStoryEditorCommentEntryActions({
    story: input.story,
    reviewOnly: input.reviewOnly,
    placingComment: input.placingComment,
    commentsOpen: input.commentsOpen,
    getFlowInstance: input.getFlowInstance,
    comments: input.comments,
    selectedCommentTarget: input.selectedCommentTarget,
    selectedCommentTargetKey: input.commentSummary.selectedCommentTargetKey,
    selectedTargetThreads: input.commentProjection.selectedTargetThreads,
    showContextualComments: input.commentSummary.showContextualComments,
    setCanvasContextMenu: input.setCanvasContextMenu,
    setPlacingComment: input.setPlacingComment,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    closeInspector: input.closeInspector,
    selectExclusive: input.selectEditorExclusive,
  });
  return { focusCommentThread, openCommentsForTarget, ...deletion, ...entryActions };
}

type StoryEditorNodeSelectionInput = {
  reviewOnly: boolean;
  graphSelection?: StoryGraphSelection;
  selectedId?: string;
  selectedGraphNodeIds: ReadonlySet<string>;
  selectGraphInteractions: ReturnType<typeof useStoryEditorSelection>['selectGraphInteractions'];
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  selectCommentThread: ReturnType<typeof useStoryComments>['selectThread'];
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

export function useStoryEditorNodeSelection(input: StoryEditorNodeSelectionInput) {
  const {
    graphSelection,
    reviewOnly,
    selectCommentThread,
    selectExclusive,
    selectGraphInteractions,
    selectedGraphNodeIds,
    selectedId,
    setCanvasContextMenu,
    setCommentsOpen,
  } = input;
  return useCallback(
    (event: ReactMouseEvent, node: StoryFlowNode) => {
      selectStoryFlowNode({
        event,
        node,
        reviewOnly,
        graphSelection,
        selectedId,
        selectedGraphNodeIds,
        selectGraphInteractions,
        setCanvasContextMenu,
        setCommentsOpen,
        selectCommentThread,
        selectExclusive,
      });
    },
    [
      graphSelection,
      reviewOnly,
      selectCommentThread,
      selectExclusive,
      selectGraphInteractions,
      selectedGraphNodeIds,
      selectedId,
      setCanvasContextMenu,
      setCommentsOpen,
    ],
  );
}
