import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { TriggerEdgeData, TriggerFlowEdge } from '../storyGraph';
import { getTriggerEdgeStepPosition } from '../triggerEdgeRouting';

type TriggerEdgeProps = EdgeProps<TriggerFlowEdge>;

function hasInputInteraction(
  data: TriggerEdgeData | undefined,
): data is TriggerEdgeData & { inputInteractionId: string } {
  return typeof data?.inputInteractionId === 'string' && data.inputInteractionId !== '';
}

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
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const inputInteractionId = data?.inputInteractionId;
  const edgeWithInput = hasInputInteraction(data) ? data : undefined;
  const stepPosition = getTriggerEdgeStepPosition(
    data?.routingLaneIndex,
    data?.routingLaneCount,
    inputInteractionId !== undefined,
  );
  const elkRoute = data?.elkRoute;

  const fallback = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
    stepPosition,
  });

  const [fallbackPath, fallbackLabelX, fallbackLabelY] = fallback;

  const edgePath = elkRoute ? toPolylinePath(elkRoute) : fallbackPath;

  const elkLabel = elkRoute ? getPolylineMidpoint(elkRoute) : undefined;

  const labelX = elkLabel?.x ?? fallbackLabelX;

  const labelY = elkLabel?.y ?? fallbackLabelY;

  function toPolylinePath(points: readonly { x: number; y: number }[]) {
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  }

  function getPolylineMidpoint(points: readonly { x: number; y: number }[]) {
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }

    if (points.length === 1) {
      return points[0];
    }

    const segments = points.slice(0, -1).map((start, index) => {
      const end = points[index + 1];

      return {
        start,
        end,
        length: Math.hypot(end.x - start.x, end.y - start.y),
      };
    });

    const totalLength = segments.reduce((total, segment) => total + segment.length, 0);

    const midpoint = totalLength / 2;

    let travelled = 0;

    for (const segment of segments) {
      if (travelled + segment.length >= midpoint) {
        if (segment.length === 0) {
          return segment.start;
        }

        const ratio = (midpoint - travelled) / segment.length;

        return {
          x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
          y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        };
      }

      travelled += segment.length;
    }

    const lastPoint = points.at(-1);
    if (!lastPoint) {
      throw new Error('Expected a last point when computing a polyline midpoint.');
    }
    return lastPoint;
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      {edgeWithInput !== undefined ? (
        <path
          className="trigger-edge-hitbox"
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          pointerEvents="stroke"
          onMouseEnter={() => {
            setIsHovered(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
          }}
        />
      ) : null}
      {edgeWithInput !== undefined ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`trigger-link-delete nodrag nopan ${isHovered ? 'visible' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label={t('graph.removeTriggerInput')}
            title={t('graph.removeLink')}
            onMouseEnter={() => {
              setIsHovered(true);
            }}
            onMouseLeave={() => {
              setIsHovered(false);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              (edgeWithInput.triggerIds ?? [edgeWithInput.triggerId]).forEach((triggerId) =>
                edgeWithInput.onDeleteTriggerInput?.(
                  edgeWithInput.interactionId,
                  triggerId,
                  edgeWithInput.inputInteractionId,
                ),
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
