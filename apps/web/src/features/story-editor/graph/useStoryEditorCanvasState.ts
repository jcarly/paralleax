import { useCallback, useMemo, useRef, useState } from 'react';
import {
  useEdgesState,
  useNodesState,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { TriggerEdgeRoutes } from '../../../triggerEdgeRouting';
import { useTwoFingerCanvasPan } from './useTwoFingerCanvasPan';

export function useStoryEditorCanvasState(story?: Story) {
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryFlowNode>([]);
  const [edges, setEdges] = useEdgesState<TriggerFlowEdge>([]);
  const [elkEdgeRoutes, setElkEdgeRoutes] = useState<TriggerEdgeRoutes>(() => new Map());
  const [isOrganizing, setIsOrganizing] = useState(false);
  const organizingRef = useRef(false);
  const [failedOrganizationScope, setFailedOrganizationScope] = useState<'all' | 'selection'>();
  const [interactionSizes, setInteractionSizes] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(() => new Map());
  const interactionIds = useMemo(
    () => new Set(story?.interactions.map(({ id }) => id) ?? []),
    [story?.interactions],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange<StoryFlowNode>[]) => {
      onNodesChange(changes);
      setInteractionSizes((current) =>
        applyInteractionSizeChanges(current, changes, interactionIds),
      );
    },
    [interactionIds, onNodesChange],
  );
  const flowInstanceRef = useRef<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>(null);
  const [pendingFocusInteractionId, setPendingFocusInteractionId] = useState<string>();
  const appliedInitialFocusInteractionIdRef = useRef<string | undefined>(undefined);
  const canvasRef = useRef<HTMLElement | null>(null);
  useTwoFingerCanvasPan(canvasRef, story?.id);
  return {
    nodes,
    setNodes,
    handleNodesChange,
    edges,
    setEdges,
    elkEdgeRoutes,
    setElkEdgeRoutes,
    isOrganizing,
    setIsOrganizing,
    organizingRef,
    failedOrganizationScope,
    setFailedOrganizationScope,
    interactionSizes,
    flowInstanceRef,
    pendingFocusInteractionId,
    setPendingFocusInteractionId,
    appliedInitialFocusInteractionIdRef,
    canvasRef,
  };
}

function applyInteractionSizeChanges(
  current: ReadonlyMap<string, { width: number; height: number }>,
  changes: NodeChange<StoryFlowNode>[],
  interactionIds: ReadonlySet<string>,
) {
  let next: Map<string, { width: number; height: number }> | undefined;
  for (const change of changes) {
    if (!isTrackedDimensionChange(change, interactionIds)) {
      continue;
    }
    const previous = (next ?? current).get(change.id);
    if (sameInteractionSize(previous, change.dimensions)) {
      continue;
    }
    next ??= new Map(current);
    next.set(change.id, change.dimensions);
  }
  return next ?? current;
}

type DimensionsChange = Extract<NodeChange<StoryFlowNode>, { type: 'dimensions' }> & {
  dimensions: { width: number; height: number };
};

function isTrackedDimensionChange(
  change: NodeChange<StoryFlowNode>,
  interactionIds: ReadonlySet<string>,
): change is DimensionsChange {
  return (
    change.type === 'dimensions' && change.dimensions !== undefined && interactionIds.has(change.id)
  );
}

function sameInteractionSize(
  previous: { width: number; height: number } | undefined,
  next: { width: number; height: number },
) {
  return previous?.width === next.width && previous.height === next.height;
}
