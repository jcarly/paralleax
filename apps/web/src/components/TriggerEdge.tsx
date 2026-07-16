import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { TriggerFlowEdge } from '../storyGraph';

type TriggerEdgeProps = EdgeProps<TriggerFlowEdge>;

function getAdaptiveEdgePositions(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const verticalDistance = targetY - sourceY;
  const horizontalDistance = targetX - sourceX;

  if (Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.6) {
    return {
      sourcePosition: horizontalDistance > 0 ? Position.Right : Position.Left,
      targetPosition: horizontalDistance > 0 ? Position.Left : Position.Right,
    };
  }

  return {
    sourcePosition: verticalDistance >= 0 ? Position.Bottom : Position.Top,
    targetPosition: verticalDistance >= 0 ? Position.Top : Position.Bottom,
  };
}

export function TriggerEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: TriggerEdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { sourcePosition, targetPosition } = getAdaptiveEdgePositions(
    sourceX,
    sourceY,
    targetX,
    targetY,
  );
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  });
  const inputInteractionId = data?.inputInteractionId;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      {data && inputInteractionId ? (
        <path
          className="trigger-edge-hitbox"
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          pointerEvents="stroke"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        />
      ) : null}
      {data && inputInteractionId ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`trigger-link-delete nodrag nopan ${isHovered ? 'visible' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label="Remove trigger input"
            title="Remove link"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              (data.triggerIds ?? [data.triggerId]).forEach((triggerId) =>
                data.onDeleteTriggerInput?.(data.interactionId, triggerId, inputInteractionId),
              );
            }}
          >
            x
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
