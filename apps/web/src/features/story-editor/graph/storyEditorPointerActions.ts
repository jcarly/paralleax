import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from 'react';
import type { NodeMouseHandler, ReactFlowInstance } from '@xyflow/react';
import type { Position, Story } from '@paralleax/shared';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { StoryGraphSelection } from '../../../storyGraphSelection';
import type { useStoryComments } from '../../comments/useStoryComments';
import type { StoryEditorExclusiveSelection } from '../selection/useStoryEditorSelection';

type StoryGraphContextTarget =
  | { kind: 'canvas' }
  | { kind: 'interaction'; interactionId: string }
  | { kind: 'trigger'; interactionId: string; triggerId: string }
  | { kind: 'graphDecoration'; decorationId: string };

export type StoryGraphElementContextTarget = Exclude<StoryGraphContextTarget, { kind: 'canvas' }>;
export interface CanvasContextMenuState {
  screenPosition: Position;
  flowPosition: Position;
  target: StoryGraphContextTarget;
}

type StoryNodeSelectEvent = Parameters<NodeMouseHandler<StoryFlowNode>>[0];
type GraphSelectionHandler = (
  interactionIds: string[],
  triggers?: StoryGraphSelection['triggers'],
) => void;

type StoryNodeSelectionInput = {
  event: StoryNodeSelectEvent;
  node: StoryFlowNode;
  reviewOnly: boolean;
  graphSelection: StoryGraphSelection | undefined;
  selectedId: string | undefined;
  selectedGraphNodeIds: ReadonlySet<string>;
  selectGraphInteractions: GraphSelectionHandler;
  setCanvasContextMenu: (state: CanvasContextMenuState | undefined) => void;
  setCommentsOpen: (open: boolean) => void;
  selectCommentThread: (threadId?: string) => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

export function selectStoryFlowNode(input: StoryNodeSelectionInput) {
  input.setCanvasContextMenu(undefined);
  if (input.node.type === 'commentPin') {
    return;
  }
  if (toggleGraphNodeSelection(input)) {
    return;
  }

  input.setCommentsOpen(false);
  input.selectCommentThread(undefined);
  if (input.selectedGraphNodeIds.has(input.node.id)) {
    return;
  }
  selectSingleGraphNode(input);
}

type StoryEditorPointerActionInput = {
  story: Story | undefined;
  reviewOnly: boolean;
  placingComment: boolean;
  commentsOpen: boolean;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  selectCommentThread: ReturnType<typeof useStoryComments>['selectThread'];
  setCanvasContextMenu: (state: CanvasContextMenuState | undefined) => void;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: (key: string | undefined) => void;
  startCommentThread: ReturnType<typeof useStoryComments>['startThread'];
  closeInspector: () => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  cancelCommentDraft: ReturnType<typeof useStoryComments>['cancelDraft'];
};

function runStoryPaneClick(input: StoryEditorPointerActionInput, event: ReactMouseEvent) {
  input.setCanvasContextMenu(undefined);
  input.selectCommentThread(undefined);
  if (input.placingComment && input.story?.capabilities?.canComment === true) {
    const position = input.getFlowInstance()?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (position) {
      runStartStoryCanvasComment(input, position);
    }
    input.setPlacingComment(false);
    return;
  }
  input.closeInspector();
}

function runStoryPaneContextMenu(
  input: StoryEditorPointerActionInput,
  event: MouseEvent | ReactMouseEvent,
) {
  event.preventDefault();
  if (input.reviewOnly && input.story?.capabilities?.canComment !== true) {
    return;
  }
  const position = input.getFlowInstance()?.screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  if (!position) {
    return;
  }
  input.setPlacingComment(false);
  input.selectCommentThread(undefined);
  input.setCanvasContextMenu({
    screenPosition: { x: event.clientX, y: event.clientY },
    flowPosition: position,
    target: { kind: 'canvas' },
  });
}

function runStoryNodeContextMenu(
  input: StoryEditorPointerActionInput,
  event: Parameters<NodeMouseHandler<StoryFlowNode>>[0],
  node: StoryFlowNode,
) {
  event.preventDefault();
  const target = getStoryNodeContextTarget(event, node);
  if (!target) {
    return;
  }
  const position = input.getFlowInstance()?.screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  if (!position || isUnavailableReviewTarget(input, target)) {
    return;
  }
  input.setPlacingComment(false);
  input.selectCommentThread(undefined);
  selectStoryGraphContextTarget(target, input.selectExclusive);
  input.setCanvasContextMenu({
    screenPosition: { x: event.clientX, y: event.clientY },
    flowPosition: position,
    target,
  });
}

function isUnavailableReviewTarget(
  input: Pick<StoryEditorPointerActionInput, 'reviewOnly' | 'story'>,
  target: StoryGraphElementContextTarget,
) {
  return (
    input.reviewOnly &&
    (input.story?.capabilities?.canComment !== true || target.kind === 'graphDecoration')
  );
}

function runStartStoryCanvasComment(input: StoryEditorPointerActionInput, position: Position) {
  if (input.story?.capabilities?.canComment !== true) {
    return;
  }
  input.startCommentThread({ kind: 'canvas', position });
  input.selectCommentThread(undefined);
  input.setCommentsOpen(false);
}

function runToggleStoryComments(input: StoryEditorPointerActionInput, commentsOpen: boolean) {
  if (!commentsOpen) {
    input.cancelCommentDraft();
    input.selectCommentThread(undefined);
    input.setContextualCommentsTargetKey(undefined);
  }
  input.setCommentsOpen((open) => !open);
}

export function useStoryEditorPointerActions(input: StoryEditorPointerActionInput) {
  return {
    handlePaneClick: (event: ReactMouseEvent) => {
      runStoryPaneClick(input, event);
    },
    handlePaneContextMenu: (event: MouseEvent | ReactMouseEvent) => {
      runStoryPaneContextMenu(input, event);
    },
    handleNodeContextMenu: (
      event: Parameters<NodeMouseHandler<StoryFlowNode>>[0],
      node: StoryFlowNode,
    ) => {
      runStoryNodeContextMenu(input, event, node);
    },
    startCanvasComment: (position: Position) => {
      runStartStoryCanvasComment(input, position);
    },
    toggleCommentsList: () => {
      runToggleStoryComments(input, input.commentsOpen);
    },
  };
}

function selectedInteractionIds(selectedId: string | undefined) {
  return selectedId !== undefined && selectedId.length > 0 ? [selectedId] : [];
}

function toggleGraphNodeSelection(input: StoryNodeSelectionInput) {
  const { event, node, reviewOnly, graphSelection, selectedId } = input;
  if (reviewOnly || node.type !== 'interaction' || !(event.ctrlKey || event.metaKey)) {
    return false;
  }
  const current = graphSelection?.interactionIds ?? selectedInteractionIds(selectedId);
  const next = current.includes(node.id)
    ? current.filter((id) => id !== node.id)
    : [...current, node.id];
  input.selectGraphInteractions(next, graphSelection?.triggers);
  input.setCommentsOpen(false);
  return true;
}

function selectSingleGraphNode(input: StoryNodeSelectionInput) {
  if (input.node.type === 'graphDecoration') {
    if (!input.reviewOnly) {
      input.selectExclusive({ type: 'graphDecoration', id: input.node.id });
    }
    return;
  }
  if (input.node.type === 'interaction') {
    input.selectExclusive({ type: 'interaction', id: input.node.id });
  }
}

function getStoryNodeContextTarget(
  event: Parameters<NodeMouseHandler<StoryFlowNode>>[0],
  node: StoryFlowNode,
): StoryGraphElementContextTarget | undefined {
  const triggerElement =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-interaction-id][data-trigger-id]')
      : null;
  const rootTriggerId = node.type === 'interaction' ? triggerElement?.dataset.triggerId : undefined;
  if (node.type === 'interaction' && rootTriggerId !== undefined && rootTriggerId.length > 0) {
    return { kind: 'trigger', interactionId: node.id, triggerId: rootTriggerId };
  }
  if (node.type === 'trigger') {
    return {
      kind: 'trigger',
      interactionId: node.data.interactionId,
      triggerId: node.data.triggerId,
    };
  }
  if (node.type === 'graphDecoration') {
    return { kind: 'graphDecoration', decorationId: node.id };
  }
  if (node.type === 'interaction') {
    return { kind: 'interaction', interactionId: node.id };
  }
  return undefined;
}

function selectStoryGraphContextTarget(
  target: StoryGraphElementContextTarget,
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void,
) {
  if (target.kind === 'interaction') {
    selectExclusive({ type: 'interaction', id: target.interactionId });
    return;
  }
  if (target.kind === 'trigger') {
    selectExclusive({
      type: 'trigger',
      trigger: { interactionId: target.interactionId, triggerId: target.triggerId },
    });
    return;
  }
  selectExclusive({ type: 'graphDecoration', id: target.decorationId });
}
