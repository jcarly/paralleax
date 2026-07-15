import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { TriggerFlowEdge } from '../storyGraph';

type TriggerEdgeProps = EdgeProps<TriggerFlowEdge>;

export function TriggerEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: TriggerEdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />;
}
