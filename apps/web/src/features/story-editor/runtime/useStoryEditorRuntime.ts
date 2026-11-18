import type { useStoryEditorBaseRuntime } from './useStoryEditorBaseRuntime';
import { useStoryEditorSelectionModel } from '../selection/useStoryEditorSelectionModel';
import {
  useStoryEditorConnectionRuntime,
  useStoryEditorRootCreation,
} from '../graph/useStoryEditorConnectionRuntime';
import { useStoryEditorCommentStateRuntime } from '../../comments/useStoryEditorCommentState';
import {
  useStoryEditorCanvasCommentNodes,
  useStoryEditorCommentActionsRuntime,
  useStoryEditorNodeSelection,
} from '../graph/useStoryEditorInteractionActions';
import { useStoryEditorNarrativeProjection } from '../graph/useStoryEditorNarrativeProjection';
import { useStoryEditorEdgeModel } from '../graph/useStoryEditorFlowSynchronization';
import { useStoryEditorNodeDragHandlers } from '../graph/useStoryEditorNodeDragHandlers';
import { useStoryEditorActionModel } from '../graph/useStoryEditorActionModel';
import {
  useStoryEditorFlowEventHandlers,
  type StoryEditorFlowModelInput,
} from '../graph/storyEditorFlowProps';
import {
  useStoryEditorGraphPreparation,
  useStoryEditorSettingsClose,
} from '../graph/useStoryEditorPageEffects';
import { useStoryEditorHistoryShortcuts } from '../history/useStoryEditorHistoryShortcuts';

export type StoryEditorBaseRuntime = ReturnType<typeof useStoryEditorBaseRuntime>;
type StoryEditorPageSelectionModel = ReturnType<typeof useStoryEditorSelectionModel>;
type StoryEditorConnectionRuntime = ReturnType<typeof useStoryEditorConnectionRuntime>;
type StoryEditorCommentStateRuntime = ReturnType<typeof useStoryEditorCommentStateRuntime>;
type StoryEditorCommentActionsRuntime = ReturnType<typeof useStoryEditorCommentActionsRuntime>;
type StoryEditorNarrativeProjection = ReturnType<typeof useStoryEditorNarrativeProjection>;

function useStoryEditorPageSelection(base: StoryEditorBaseRuntime) {
  const { persistence, uiState, canvasState } = base;
  const selectionModel = useStoryEditorSelectionModel({
    storyId: base.storyId,
    story: persistence.story,
    loadPhase: persistence.loadPhase,
    storyRouteInaccessible: persistence.storyRouteInaccessible,
    flowInstanceRef: canvasState.flowInstanceRef,
    setCommentsOpen: uiState.setCommentsOpen,
    setContextualCommentsTargetKey: uiState.setContextualCommentsTargetKey,
  });
  useStoryEditorGraphPreparation(persistence.loadPhase, persistence.story?.id);
  useStoryEditorHistoryShortcuts(persistence);
  const closeStorySettings = useStoryEditorSettingsClose({
    setStorySettingsTab: uiState.setStorySettingsTab,
    storySettingsTriggerRef: base.storySettingsTriggerRef,
    searchParams: base.searchParams,
    setSearchParams: base.setSearchParams,
  });
  return { selectionModel, closeStorySettings };
}

function useStoryEditorPageConnection(
  base: StoryEditorBaseRuntime,
  selection: StoryEditorPageSelectionModel,
) {
  const { persistence, canvasState } = base;
  return useStoryEditorConnectionRuntime({
    story: persistence.story,
    interactionSizes: canvasState.interactionSizes,
    loadPhase: persistence.loadPhase,
    searchParams: base.searchParams,
    setSearchParams: base.setSearchParams,
    appliedInitialFocusInteractionIdRef: canvasState.appliedInitialFocusInteractionIdRef,
    setPendingFocusInteractionId: canvasState.setPendingFocusInteractionId,
    flowInstanceRef: canvasState.flowInstanceRef,
    selectInteraction: selection.selectInteraction,
    createChildFromInteraction: persistence.createChildFromInteraction,
    createParentForInteraction: persistence.createParentForInteraction,
    connectInteractions: persistence.connectInteractions,
    connectToExistingTrigger: persistence.connectToExistingTrigger,
    setConnectionConflict: base.setConnectionConflict,
    reportSaveError: persistence.reportSaveError,
  });
}

function useStoryEditorPageComments(
  base: StoryEditorBaseRuntime,
  selection: StoryEditorPageSelectionModel,
  currentUserId?: string,
) {
  const { persistence, uiState, canvasState } = base;
  const commentState = useStoryEditorCommentStateRuntime({
    storyId: base.storyId,
    story: persistence.story,
    currentUserId,
    loadPhase: persistence.loadPhase,
    commentsOpen: uiState.commentsOpen,
    contextualCommentsTargetKey: uiState.contextualCommentsTargetKey,
    hasInspectorSelection: selection.hasInspectorSelection,
    selectedCommentTarget: selection.selectedCommentTarget,
  });
  const commentActionsRuntime = useStoryEditorCommentActionsRuntime({
    t: base.t,
    story: persistence.story,
    comments: commentState.comments,
    commentProjection: commentState.commentProjection,
    commentSummary: commentState.commentSummary,
    selectedCommentTarget: selection.selectedCommentTarget,
    closeInspector: selection.closeInspector,
    selectEditorExclusive: selection.selectEditorExclusive,
    setCommentsOpen: uiState.setCommentsOpen,
    setContextualCommentsTargetKey: uiState.setContextualCommentsTargetKey,
    setCanvasContextMenu: uiState.setCanvasContextMenu,
    setPlacingComment: uiState.setPlacingComment,
    getFlowInstance: () => canvasState.flowInstanceRef.current,
    reviewOnly: commentState.reviewOnly,
    commentsOpen: uiState.commentsOpen,
    placingComment: uiState.placingComment,
  });
  return { commentState, commentActionsRuntime };
}

function useStoryEditorPageNarrative(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  connection: StoryEditorConnectionRuntime;
  comments: StoryEditorCommentStateRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
}) {
  const { base, selection, connection, comments, commentActions } = input;
  const narrativeProjection = useStoryEditorNarrativeProjection({
    story: base.persistence.story,
    selectedId: selection.selectedId,
    selectedTrigger: selection.selectedTrigger,
    selectedGraphDecorationId: selection.selectedGraphDecorationId,
    progress: selection.onboarding.progress,
    reviewOnly: comments.reviewOnly,
    createChildAndFocus: connection.createChildAndFocus,
    createParentAndFocus: connection.createParentAndFocus,
    selectExclusive: selection.selectExclusive,
    occurrenceCounts: selection.navigation.contextNavigation.occurrenceCounts,
    emphasizedInteractionIds: selection.navigation.emphasizedInteractionIds,
    graphCommentCounts: comments.commentProjection.counts.graphCommentCounts,
    openCommentsForTarget: commentActions.openCommentsForTarget,
    t: base.t,
    graphSelection: selection.graphSelection,
    updateGraphDecoration: base.persistence.updateGraphDecoration,
  });
  return {
    createRootFromClick: useStoryEditorRootCreation(
      base.persistence.createRoot,
      connection.getClickCreationPosition,
      connection.focusInteractionNode,
    ),
    narrativeProjection,
  };
}

function useStoryEditorPageGraphSynchronization(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  comments: StoryEditorCommentStateRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
  narrative: StoryEditorNarrativeProjection;
}) {
  const { base, selection, comments, commentActions, narrative } = input;
  const { persistence, uiState, canvasState } = base;
  useStoryEditorCanvasCommentNodes({
    story: persistence.story,
    comments: comments.comments,
    activeCommentThreads: comments.commentProjection.activeCommentThreads,
    canManageCommentThread: comments.canManageCommentThread,
    canDeleteCommentThread: comments.canDeleteCommentThread,
    deleteCommentThread: commentActions.deleteCommentThread,
    setCommentsOpen: uiState.setCommentsOpen,
    reviewOnly: comments.reviewOnly,
    decorationNodes: narrative.decorationNodes,
    narrativeNodes: narrative.narrativeNodes,
    setNodes: canvasState.setNodes,
    nodes: canvasState.nodes,
    pendingFocusInteractionId: canvasState.pendingFocusInteractionId,
    setPendingFocusInteractionId: canvasState.setPendingFocusInteractionId,
    flowInstanceRef: canvasState.flowInstanceRef,
  });
  useStoryEditorEdgeModel({
    story: persistence.story,
    elkEdgeRoutes: canvasState.elkEdgeRoutes,
    setEdges: canvasState.setEdges,
    selectCommentThread: comments.selectCommentThread,
    selectExclusive: selection.selectExclusive,
    deleteTriggerInput: persistence.deleteTriggerInput,
    closeInspector: selection.closeInspector,
  });
}

function useStoryEditorPageNodeInteractions(
  base: StoryEditorBaseRuntime,
  selection: StoryEditorPageSelectionModel,
  comments: StoryEditorCommentStateRuntime,
) {
  const { persistence, uiState, canvasState } = base;
  const nodeDragHandlers = useStoryEditorNodeDragHandlers({
    story: persistence.story,
    graphSelection: selection.graphSelection,
    selectedGraphNodeIds: selection.selectedGraphNodeIds,
    setNodes: canvasState.setNodes,
    setEdges: canvasState.setEdges,
    setElkEdgeRoutes: canvasState.setElkEdgeRoutes,
    closeInspector: selection.closeInspector,
    beginLocalEdit: persistence.beginLocalEdit,
    endLocalEdit: persistence.endLocalEdit,
    saveGraphPositions: persistence.saveGraphPositions,
    reanchorComment: comments.comments.reanchor,
  });
  const selectNode = useStoryEditorNodeSelection({
    reviewOnly: comments.reviewOnly,
    graphSelection: selection.graphSelection,
    selectedId: selection.selectedId,
    selectedGraphNodeIds: selection.selectedGraphNodeIds,
    selectGraphInteractions: selection.selectGraphInteractions,
    setCanvasContextMenu: uiState.setCanvasContextMenu,
    setCommentsOpen: uiState.setCommentsOpen,
    selectCommentThread: comments.selectCommentThread,
    selectExclusive: selection.selectExclusive,
  });
  return { nodeDragHandlers, selectNode };
}

function useStoryEditorPageFlowModel(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  comments: StoryEditorCommentStateRuntime;
  connection: StoryEditorConnectionRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
  nodeInteractions: ReturnType<typeof useStoryEditorPageNodeInteractions>;
  narrative: StoryEditorNarrativeProjection;
}) {
  const { base, selection, comments, connection, commentActions, nodeInteractions, narrative } =
    input;
  const { persistence, canvasState } = base;
  const { connectionController } = connection;
  const { pointerActions } = commentActions;
  const { nodeDragHandlers, selectNode } = nodeInteractions;
  const flowModelInput: StoryEditorFlowModelInput = {
    nodes: canvasState.nodes,
    edges: canvasState.edges,
    onNodesChange: canvasState.handleNodesChange,
    onConnect: connectionController.requestConnection,
    onConnectStart: connectionController.startCanvasConnection,
    onConnectEnd: connectionController.endCanvasConnection,
    onNodeClick: selectNode,
    onNodeContextMenu: pointerActions.handleNodeContextMenu,
    onPaneClick: pointerActions.handlePaneClick,
    onPaneContextMenu: pointerActions.handlePaneContextMenu,
    onSelectionStart: selection.handleGraphSelectionStart,
    onSelectionChange: selection.handleGraphSelectionChange,
    onSelectionEnd: selection.handleGraphSelectionEnd,
    onNodeDragStart: nodeDragHandlers.handleNodeDragStart,
    onNodeDrag: nodeDragHandlers.handleNodeDrag,
    fitViewOptions: narrative.initialFitViewOptions,
    selectionOnDrag: !comments.reviewOnly,
    reviewOnly: comments.reviewOnly,
    nodeDragHandlers,
    updateGraphDecoration: persistence.updateGraphDecoration,
    endLocalEdit: persistence.endLocalEdit,
  };
  return {
    flowModelInput,
    flowEventHandlers: useStoryEditorFlowEventHandlers(flowModelInput),
  };
}

export function useStoryEditorRuntime(base: StoryEditorBaseRuntime, currentUserId?: string) {
  const { selectionModel, closeStorySettings } = useStoryEditorPageSelection(base);
  const connection = useStoryEditorPageConnection(base, selectionModel);
  const { commentState, commentActionsRuntime } = useStoryEditorPageComments(
    base,
    selectionModel,
    currentUserId,
  );
  const narrative = useStoryEditorPageNarrative({
    base,
    selection: selectionModel,
    connection,
    comments: commentState,
    commentActions: commentActionsRuntime,
  });
  useStoryEditorPageGraphSynchronization({
    base,
    selection: selectionModel,
    comments: commentState,
    commentActions: commentActionsRuntime,
    narrative: narrative.narrativeProjection,
  });
  const graphRuntime = useStoryEditorGraphRuntime({
    base,
    selection: selectionModel,
    comments: commentState,
    connection,
    commentActions: commentActionsRuntime,
    narrative: narrative.narrativeProjection,
  });
  const { nodeInteractions, actionModel, flowModel } = graphRuntime;
  return {
    selection: selectionModel,
    connection,
    comments: commentState,
    commentActions: commentActionsRuntime,
    narrative: narrative.narrativeProjection,
    createRootFromClick: narrative.createRootFromClick,
    nodeInteractions,
    actions: actionModel,
    flowModel,
    closeStorySettings,
  };
}

function useStoryEditorGraphRuntime(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  comments: StoryEditorCommentStateRuntime;
  connection: StoryEditorConnectionRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
  narrative: StoryEditorNarrativeProjection;
}) {
  const { base, selection, comments, connection, commentActions, narrative } = input;
  const nodeInteractions = useStoryEditorPageNodeInteractions(base, selection, comments);
  const actionModel = useStoryEditorActionModel({
    persistence: base.persistence,
    uiState: base.uiState,
    canvasState: base.canvasState,
    selection,
    contextNavigation: selection.navigation.contextNavigation,
    reviewOnly: comments.reviewOnly,
    t: base.t,
  });
  const flowModel = useStoryEditorPageFlowModel({
    base,
    selection,
    comments,
    connection,
    commentActions,
    nodeInteractions,
    narrative,
  });
  return { nodeInteractions, actionModel, flowModel };
}
