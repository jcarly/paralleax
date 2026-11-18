import type { Story } from '@paralleax/shared';
import type { StoryEditorBaseRuntime, useStoryEditorRuntime } from './useStoryEditorRuntime';
import type { StoryEditorCanvasViewModel } from '../graph/StoryEditorCanvasContent';
import {
  buildStoryEditorCanvasMenuActions,
  buildStoryEditorCanvasToolbarProps,
} from '../graph/storyEditorCanvasActions';
import { buildStoryEditorFlowProps } from '../graph/storyEditorFlowProps';
import {
  buildStoryEditorInspectorActions,
  buildStoryEditorInspectorModel,
} from '../inspectors/storyEditorInspectorModel';

function buildStoryEditorInspectorActionsForPage(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
) {
  return buildStoryEditorInspectorActions({
    commentActions: runtime.commentActions.commentActions,
    entityActions: runtime.actions.entityActions,
    setCommentsOpen: base.uiState.setCommentsOpen,
    closeInspector: runtime.selection.closeInspector,
    deleteCommentThread: runtime.commentActions.deleteCommentThread,
    restoreCommentThread: runtime.commentActions.restoreCommentThread,
    focusCommentThread: runtime.commentActions.focusCommentThread,
    deleteGraphElement: runtime.actions.graphDeletion.deleteGraphElement,
    deleteSelectedTrigger: runtime.actions.graphDeletion.deleteSelectedTrigger,
    remove: runtime.actions.graphDeletion.remove,
    createEditorGroup: runtime.actions.createEditorGroup,
    createChildAndFocus: runtime.connection.createChildAndFocus,
    updateGraphDecoration: base.persistence.updateGraphDecoration,
    selectExclusive: runtime.selection.selectExclusive,
    reportStepComplete: runtime.selection.onboarding.reportStepComplete,
    persistence: base.persistence,
  });
}

export function buildStoryEditorInspectorModelForPage(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
  story: Story,
) {
  return buildStoryEditorInspectorModel({
    story,
    storyId: base.storyId,
    t: base.t,
    reviewOnly: runtime.comments.reviewOnly,
    commentsOpen: base.uiState.commentsOpen,
    hasInspectorSelection: runtime.selection.hasInspectorSelection,
    selection: runtime.selection.editorSelection,
    comments: runtime.comments.comments,
    commentProjection: runtime.comments.commentProjection,
    commentSummary: runtime.comments.commentSummary,
    canManageCommentThread: runtime.comments.canManageCommentThread,
    canDeleteCommentThread: runtime.comments.canDeleteCommentThread,
    categories: runtime.selection.navigation.contextNavigation,
    actions: buildStoryEditorInspectorActionsForPage(base, runtime),
  });
}

function buildStoryEditorHistoryProps(base: StoryEditorBaseRuntime) {
  const { persistence } = base;
  return {
    open: base.uiState.historyOpen,
    history: persistence.history,
    busy:
      persistence.historyBusy ||
      persistence.saveStatus === 'saving' ||
      persistence.saveStatus === 'error',
    onUndo: () => void persistence.undo(),
    onRedo: () => void persistence.redo(),
    onClose: () => {
      base.uiState.setHistoryOpen(false);
    },
  } satisfies StoryEditorCanvasViewModel['historyProps'];
}

function buildStoryEditorCanvasContextMenu(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
): StoryEditorCanvasViewModel['contextMenu'] {
  const menu = base.uiState.canvasContextMenu;
  if (!menu) {
    return undefined;
  }
  return {
    state: menu,
    actions: buildStoryEditorCanvasMenuActions({
      menu,
      createRootFromClick: runtime.createRootFromClick,
      startCanvasComment: runtime.commentActions.pointerActions.startCanvasComment,
      startEntityCommentForTarget:
        runtime.commentActions.commentActions.startEntityCommentForTarget,
      addGraphDecoration: runtime.actions.addGraphDecoration,
      createChildAndFocus: runtime.connection.createChildAndFocus,
      deleteGraphElement: runtime.actions.graphDeletion.deleteGraphElement,
      organizeGraph: runtime.actions.organizeGraph,
      setCanvasContextMenu: base.uiState.setCanvasContextMenu,
    }),
  };
}

export function buildStoryEditorCanvasModel(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
  story: Story,
): StoryEditorCanvasViewModel {
  const { persistence, canvasState, uiState } = base;
  const { reviewOnly } = runtime.comments;
  const { selectedLayoutTargets, organizeGraph, addGraphDecoration } = runtime.actions;
  const createToolbarProps = buildStoryEditorCanvasToolbarProps({
    story,
    reviewOnly,
    isOrganizing: canvasState.isOrganizing,
    selectedLayoutTargets,
    placingComment: uiState.placingComment,
    history: persistence.history,
    historyBusy: persistence.historyBusy,
    saveStatus: persistence.saveStatus,
    historyOpen: uiState.historyOpen,
    undo: persistence.undo,
    redo: persistence.redo,
    setHistoryOpen: uiState.setHistoryOpen,
    refreshHistory: persistence.refreshHistory,
    createRootFromClick: runtime.createRootFromClick,
    addGraphDecoration,
    organizeGraph,
    setPlacingComment: uiState.setPlacingComment,
  });
  return {
    isOrganizing: canvasState.isOrganizing,
    connectionConflict: base.connectionConflict,
    setConnectionConflict: base.setConnectionConflict,
    story,
    reviewOnly,
    toolbarProps: createToolbarProps,
    historyProps: buildStoryEditorHistoryProps(base),
    contextMenu: buildStoryEditorCanvasContextMenu(base, runtime),
    flowProps: buildStoryEditorFlowProps(
      runtime.flowModel.flowModelInput,
      runtime.flowModel.flowEventHandlers,
    ),
    selectedLayoutTargets,
  };
}
