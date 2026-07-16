import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
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
  data,
}: TriggerEdgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
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
