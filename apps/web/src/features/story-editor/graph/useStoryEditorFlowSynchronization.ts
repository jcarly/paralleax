import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import {
  buildTriggerEdges,
  type SelectedTrigger,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../../../storyGraph';
import type { TriggerEdgeRoutes } from '../../../triggerEdgeRouting';
import type { CommentPinFlowNode } from '../../comments/CommentPinNode';
import type { buildGraphDecorationNodes } from '../../graph-decorations/graphDecorationNodes';
import type { StoryEditorExclusiveSelection } from '../selection/useStoryEditorSelection';
import { reconcileStoryFlowEdges, reconcileStoryFlowNodes } from './storyFlowReconciliation';

type StoryEditorFlowNodeSyncInput = {
  decorationNodes: ReturnType<typeof buildGraphDecorationNodes>;
  narrativeNodes: StoryFlowNode[];
  commentNodes: CommentPinFlowNode[];
  reviewOnly: boolean;
  setNodes: Dispatch<SetStateAction<StoryFlowNode[]>>;
  nodes: StoryFlowNode[];
  pendingFocusInteractionId?: string;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
};

export function useStoryEditorFlowNodeSynchronization({
  decorationNodes,
  narrativeNodes,
  commentNodes,
  reviewOnly,
  setNodes,
  nodes,
  pendingFocusInteractionId,
  setPendingFocusInteractionId,
  flowInstanceRef,
}: StoryEditorFlowNodeSyncInput) {
  useEffect(() => {
    const projectedNodes = [
      ...decorationNodes,
      ...narrativeNodes.map((node) => (reviewOnly ? { ...node, draggable: false } : node)),
      ...commentNodes,
    ];
    setNodes((current) => reconcileStoryFlowNodes(current, projectedNodes));
  }, [commentNodes, decorationNodes, narrativeNodes, reviewOnly, setNodes]);
  useEffect(() => {
    const interactionId = pendingFocusInteractionId;
    if (
      interactionId === undefined ||
      interactionId.length === 0 ||
      !nodes.some((node) => node.id === interactionId)
    ) {
      return;
    }
    window.requestAnimationFrame(() => {
      setPendingFocusInteractionId((current) => (current === interactionId ? undefined : current));
      void flowInstanceRef.current?.fitView({
        nodes: [{ id: interactionId }],
        duration: 250,
        padding: 0.7,
        maxZoom: 1,
      });
    });
  }, [flowInstanceRef, nodes, pendingFocusInteractionId, setPendingFocusInteractionId]);
}

function useStoryEditorFlowEdgeSynchronization(
  storyEdges: TriggerFlowEdge[],
  setEdges: Dispatch<SetStateAction<TriggerFlowEdge[]>>,
) {
  useEffect(() => {
    setEdges((current) => reconcileStoryFlowEdges(current, storyEdges));
  }, [setEdges, storyEdges]);
}

type StoryEditorEdgeModelInput = {
  story?: Story;
  elkEdgeRoutes: TriggerEdgeRoutes;
  setEdges: Dispatch<SetStateAction<TriggerFlowEdge[]>>;
  selectCommentThread: (threadId?: string) => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  deleteTriggerInput: ReturnType<typeof useStoryEditorPersistence>['deleteTriggerInput'];
  closeInspector: () => void;
};

export function useStoryEditorEdgeModel({
  story,
  elkEdgeRoutes,
  setEdges,
  selectCommentThread,
  selectExclusive,
  deleteTriggerInput,
  closeInspector,
}: StoryEditorEdgeModelInput) {
  const selectTriggerData = useCallback(
    (trigger: SelectedTrigger) => {
      selectCommentThread(undefined);
      selectExclusive({ type: 'trigger', trigger });
    },
    [selectCommentThread, selectExclusive],
  );
  const deleteSelectedTriggerInput = useCallback(
    async (interactionId: string, triggerId: string, inputInteractionId: string) => {
      await deleteTriggerInput(interactionId, triggerId, inputInteractionId);
      closeInspector();
    },
    [closeInspector, deleteTriggerInput],
  );
  const storyEdges = useMemo(
    () =>
      buildTriggerEdges(
        story,
        selectTriggerData,
        (interactionId, triggerId, inputId) => {
          void deleteSelectedTriggerInput(interactionId, triggerId, inputId);
        },
        elkEdgeRoutes,
      ),
    [deleteSelectedTriggerInput, elkEdgeRoutes, selectTriggerData, story],
  );
  useStoryEditorFlowEdgeSynchronization(storyEdges, setEdges);
  return { storyEdges, selectTriggerData, deleteSelectedTriggerInput };
}
