import { useCallback } from 'react';
import { SelectionMode, type ReactFlowProps } from '@xyflow/react';
import { InteractionNode } from '../../../components/InteractionNode';
import { TriggerEdge } from '../../../components/TriggerEdge';
import { TriggerNode } from '../../../components/TriggerNode';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import { CommentPinNode } from '../../comments/CommentPinNode';
import { GraphDecorationNode } from '../../graph-decorations/GraphDecorationNode';
import type { useStoryEditorNodeDragHandlers } from './useStoryEditorNodeDragHandlers';

const nodeTypes = {
  interaction: InteractionNode,
  trigger: TriggerNode,
  graphDecoration: GraphDecorationNode,
  commentPin: CommentPinNode,
};
const edgeTypes = { trigger: TriggerEdge };
const canvasPanMouseButtons = [1];

export type StoryEditorFlowModelInput = Pick<
  ReactFlowProps<StoryFlowNode, TriggerFlowEdge>,
  | 'nodes'
  | 'edges'
  | 'onNodesChange'
  | 'onConnect'
  | 'onConnectStart'
  | 'onConnectEnd'
  | 'onNodeClick'
  | 'onNodeContextMenu'
  | 'onPaneClick'
  | 'onPaneContextMenu'
  | 'onSelectionStart'
  | 'onSelectionChange'
  | 'onSelectionEnd'
  | 'onNodeDragStart'
  | 'onNodeDrag'
  | 'fitViewOptions'
  | 'selectionOnDrag'
> & {
  reviewOnly: boolean;
  nodeDragHandlers: ReturnType<typeof useStoryEditorNodeDragHandlers>;
  updateGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['updateGraphDecoration'];
  endLocalEdit: ReturnType<typeof useStoryEditorPersistence>['endLocalEdit'];
};

type StoryEditorFlowEventHandlers = {
  onNodeDragStop: NonNullable<ReactFlowProps<StoryFlowNode, TriggerFlowEdge>['onNodeDragStop']>;
};

export function useStoryEditorFlowEventHandlers(
  input: StoryEditorFlowModelInput,
): StoryEditorFlowEventHandlers {
  const { endLocalEdit, nodeDragHandlers, reviewOnly, updateGraphDecoration } = input;
  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: StoryFlowNode, draggedNodes: StoryFlowNode[]) => {
      if (node.type === 'commentPin') {
        void nodeDragHandlers.persistCanvasCommentDrag(node);
        return;
      }
      if (reviewOnly) {
        return;
      }
      if (node.type === 'interaction' || node.type === 'trigger') {
        void nodeDragHandlers.persistNodeDrag(node, draggedNodes);
        return;
      }
      void updateGraphDecoration(node.id, { position: node.position });
      endLocalEdit();
    },
    [endLocalEdit, nodeDragHandlers, reviewOnly, updateGraphDecoration],
  );
  return { onNodeDragStop };
}

export function buildStoryEditorFlowProps(
  input: StoryEditorFlowModelInput,
  handlers: StoryEditorFlowEventHandlers,
) {
  return {
    nodes: input.nodes,
    edges: input.edges,
    nodeTypes,
    edgeTypes,
    onlyRenderVisibleElements: true,
    onNodesChange: input.onNodesChange,
    onConnect: input.reviewOnly ? undefined : input.onConnect,
    onConnectStart: input.reviewOnly ? undefined : input.onConnectStart,
    onConnectEnd: input.reviewOnly ? undefined : input.onConnectEnd,
    onNodeClick: input.onNodeClick,
    onNodeContextMenu: input.onNodeContextMenu,
    onPaneClick: input.onPaneClick,
    onPaneContextMenu: input.onPaneContextMenu,
    onSelectionStart: input.reviewOnly ? undefined : input.onSelectionStart,
    onSelectionChange: input.reviewOnly ? undefined : input.onSelectionChange,
    onSelectionEnd: input.reviewOnly ? undefined : input.onSelectionEnd,
    onNodeDragStart: input.reviewOnly ? undefined : input.onNodeDragStart,
    onNodeDrag: input.reviewOnly ? undefined : input.onNodeDrag,
    onNodeDragStop: handlers.onNodeDragStop,
    fitView: true,
    fitViewOptions: input.fitViewOptions,
    minZoom: 0.05,
    panOnDrag: canvasPanMouseButtons,
    panActivationKeyCode: 'Space',
    multiSelectionKeyCode: null,
    selectionOnDrag: input.selectionOnDrag,
    selectionMode: SelectionMode.Full,
    deleteKeyCode: null,
  } satisfies ReactFlowProps<StoryFlowNode, TriggerFlowEdge>;
}
