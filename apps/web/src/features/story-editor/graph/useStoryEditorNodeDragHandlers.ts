import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { useEdgesState, useNodesState } from '@xyflow/react';
import type { Position, Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import {
  applyInteractionMovesEdgePreview,
  applyInteractionMovesTriggerPreview,
  getInteractionMovesTriggerPositionUpdates,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../../../storyGraph';
import type { StoryGraphSelection } from '../../../storyGraphSelection';
import type { TriggerEdgeRoutes } from '../../../triggerEdgeRouting';
import type { CommentPinFlowNode } from '../../comments/CommentPinNode';
import type { useStoryComments } from '../../comments/useStoryComments';

type StoryEditorNodeDragInput = {
  story: Story | undefined;
  graphSelection: StoryGraphSelection | undefined;
  selectedGraphNodeIds: ReadonlySet<string>;
  setNodes: ReturnType<typeof useNodesState<StoryFlowNode>>[1];
  setEdges: ReturnType<typeof useEdgesState<TriggerFlowEdge>>[1];
  setElkEdgeRoutes: Dispatch<SetStateAction<TriggerEdgeRoutes>>;
  closeInspector: () => void;
  beginLocalEdit: () => void;
  endLocalEdit: () => void;
  saveGraphPositions: ReturnType<typeof useStoryEditorPersistence>['saveGraphPositions'];
  reanchorComment: ReturnType<typeof useStoryComments>['reanchor'];
};

function getMovedNarrativeNodes(
  input: Pick<StoryEditorNodeDragInput, 'graphSelection' | 'selectedGraphNodeIds'>,
  draggedNode: StoryFlowNode,
  draggedNodes: StoryFlowNode[],
) {
  if (!input.graphSelection || !input.selectedGraphNodeIds.has(draggedNode.id)) {
    return [draggedNode];
  }
  const selectedDraggedNodes = draggedNodes.filter(
    (node) =>
      input.selectedGraphNodeIds.has(node.id) &&
      (node.type === 'interaction' || node.type === 'trigger'),
  );
  return selectedDraggedNodes.length > 0 ? selectedDraggedNodes : [draggedNode];
}

function getInteractionPositionOverrides(movedNodes: readonly StoryFlowNode[]) {
  return new Map(
    movedNodes.flatMap((node) =>
      node.type === 'interaction' ? [[node.id, node.position] as const] : [],
    ),
  );
}

function previewStoryNodeMoves(
  input: Pick<StoryEditorNodeDragInput, 'story' | 'setNodes' | 'setEdges'>,
  movedNodes: readonly StoryFlowNode[],
  positionOverrides: ReadonlyMap<string, Position>,
) {
  const directlyMovedTriggerNodeIds = new Set(
    movedNodes.flatMap((node) => (node.type === 'trigger' ? [node.id] : [])),
  );
  input.setNodes((current) =>
    applyInteractionMovesTriggerPreview(
      current,
      input.story,
      positionOverrides,
      directlyMovedTriggerNodeIds,
    ),
  );
  input.setEdges((current) =>
    applyInteractionMovesEdgePreview(current, input.story, positionOverrides),
  );
}

function startStoryNodeDrag(
  input: Pick<
    StoryEditorNodeDragInput,
    | 'graphSelection'
    | 'selectedGraphNodeIds'
    | 'setElkEdgeRoutes'
    | 'closeInspector'
    | 'beginLocalEdit'
  >,
  node: StoryFlowNode,
) {
  input.setElkEdgeRoutes(new Map());
  if (input.graphSelection && !input.selectedGraphNodeIds.has(node.id)) {
    input.closeInspector();
  }
  input.beginLocalEdit();
}

function previewDraggedStoryNodes(
  input: Pick<
    StoryEditorNodeDragInput,
    'story' | 'graphSelection' | 'selectedGraphNodeIds' | 'setNodes' | 'setEdges'
  >,
  node: StoryFlowNode,
  draggedNodes: StoryFlowNode[],
) {
  const movedNodes = getMovedNarrativeNodes(input, node, draggedNodes);
  previewStoryNodeMoves(input, movedNodes, getInteractionPositionOverrides(movedNodes));
}

async function persistStoryNodeDrag(
  input: StoryEditorNodeDragInput,
  node: StoryFlowNode,
  draggedNodes: StoryFlowNode[],
) {
  const movedNodes = getMovedNarrativeNodes(input, node, draggedNodes);
  const positionOverrides = getInteractionPositionOverrides(movedNodes);
  const movedTriggers = movedNodes.filter(
    (movedNode): movedNode is Extract<StoryFlowNode, { type: 'trigger' }> =>
      movedNode.type === 'trigger',
  );
  const directlyMovedTriggerIds = new Set(movedTriggers.flatMap(({ data }) => data.triggerIds));
  const triggerUpdates = getInteractionMovesTriggerPositionUpdates(
    input.story,
    positionOverrides,
  ).filter((update) => update.triggerIds.every((id) => !directlyMovedTriggerIds.has(id)));
  previewStoryNodeMoves(input, movedNodes, positionOverrides);
  const interactionUpdates = Array.from(positionOverrides, ([interactionId, position]) => ({
    interactionId,
    position,
  }));
  const directlyMovedUpdates = movedTriggers.map(({ data, position }) => ({
    interactionId: data.interactionId,
    triggerIds: data.triggerIds,
    position,
  }));

  try {
    await input.saveGraphPositions({
      interactionUpdates,
      triggerUpdates: [...directlyMovedUpdates, ...triggerUpdates],
    });
  } finally {
    input.endLocalEdit();
  }
}

async function persistStoryCommentPinDrag(
  input: Pick<StoryEditorNodeDragInput, 'reanchorComment' | 'setNodes'>,
  node: CommentPinFlowNode,
) {
  const thread = node.data.thread;
  if (!thread || !node.data.canManageThread || thread.anchor.kind !== 'canvas') {
    return;
  }
  const originalPosition = thread.anchor.position;
  const result = await input.reanchorComment(thread.id, {
    kind: 'canvas',
    position: node.position,
  });
  if (result) {
    return;
  }
  input.setNodes((current) =>
    current.map((currentNode) =>
      currentNode.id === node.id ? { ...currentNode, position: originalPosition } : currentNode,
    ),
  );
}

function useStableStoryNodeDragInput(input: StoryEditorNodeDragInput) {
  return useMemo(
    () => ({
      story: input.story,
      graphSelection: input.graphSelection,
      selectedGraphNodeIds: input.selectedGraphNodeIds,
      setNodes: input.setNodes,
      setEdges: input.setEdges,
      setElkEdgeRoutes: input.setElkEdgeRoutes,
      closeInspector: input.closeInspector,
      beginLocalEdit: input.beginLocalEdit,
      endLocalEdit: input.endLocalEdit,
      saveGraphPositions: input.saveGraphPositions,
      reanchorComment: input.reanchorComment,
    }),
    [
      input.beginLocalEdit,
      input.closeInspector,
      input.endLocalEdit,
      input.graphSelection,
      input.saveGraphPositions,
      input.selectedGraphNodeIds,
      input.setEdges,
      input.setElkEdgeRoutes,
      input.setNodes,
      input.reanchorComment,
      input.story,
    ],
  );
}

export function useStoryEditorNodeDragHandlers(input: StoryEditorNodeDragInput) {
  const stableInput = useStableStoryNodeDragInput(input);
  const handleNodeDragStart = useCallback(
    (_: MouseEvent | TouchEvent, node: StoryFlowNode) => {
      startStoryNodeDrag(stableInput, node);
    },
    [stableInput],
  );
  const handleNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: StoryFlowNode, draggedNodes: StoryFlowNode[]) => {
      previewDraggedStoryNodes(stableInput, node, draggedNodes);
    },
    [stableInput],
  );
  const persistNodeDrag = useCallback(
    (node: StoryFlowNode, draggedNodes: StoryFlowNode[]) =>
      persistStoryNodeDrag(stableInput, node, draggedNodes),
    [stableInput],
  );
  const persistCanvasCommentDrag = useCallback(
    (node: CommentPinFlowNode) => persistStoryCommentPinDrag(stableInput, node),
    [stableInput],
  );
  return { handleNodeDragStart, handleNodeDrag, persistNodeDrag, persistCanvasCommentDrag };
}
