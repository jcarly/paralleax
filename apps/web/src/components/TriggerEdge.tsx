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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`trigger-marker nodrag nopan ${data?.selected ? 'selected' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          aria-label={
            data?.conditionCount ? `Trigger with ${data.conditionCount} condition(s)` : 'Trigger'
          }
          title={data?.conditionCount ? `${data.conditionCount} condition(s)` : 'Trigger'}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!data) return;
            data.onSelectTrigger?.({
              interactionId: data.interactionId,
              triggerId: data.triggerId,
              inputInteractionId: data.inputInteractionId,
            });
          }}
        />
      </EdgeLabelRenderer>
    </>
  );
}
