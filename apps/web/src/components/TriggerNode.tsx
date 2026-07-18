import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface TriggerNodeData extends Record<string, unknown> {
  interactionId: string;
  triggerId: string;
  triggerIds: string[];
  conditionCount: number;
  inputCount: number;
  orGroupCount: number;
  selected: boolean;
  onSelectTrigger?: (interactionId: string, triggerId: string) => void;
}

const routingHandles = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function TriggerNode({ data }: NodeProps) {
  const d = data as TriggerNodeData;
  const conditionLabel = d.conditionCount ? `${d.conditionCount} condition(s)` : 'No conditions';
  const inputLabel = `${d.inputCount} input${d.inputCount === 1 ? '' : 's'}`;
  const orLabel =
    d.orGroupCount > 1 ? `${d.orGroupCount} OR variants` : `${d.orGroupCount} trigger variant`;

  return (
    <div className="trigger-node">
      <Handle
        type="target"
        id="trigger-input"
        position={Position.Top}
        className="trigger-node-handle trigger-node-input"
      />
      {routingHandles.map((position) => (
        <Handle
          key={`input-${position}`}
          type="target"
          id={`routing-input-${position}`}
          position={position}
          className="routing-handle"
        />
      ))}
      <button
        type="button"
        className={`trigger-marker nodrag nopan ${d.selected ? 'selected' : ''}`}
        data-trigger-drop-target="true"
        data-interaction-id={d.interactionId}
        data-trigger-id={d.triggerId}
        data-testid={`flow-trigger-${d.interactionId}-${d.triggerId}`}
        aria-label={`Trigger, ${inputLabel}, ${conditionLabel}, ${orLabel}`}
        title={`${inputLabel}, ${conditionLabel}, ${orLabel}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          d.onSelectTrigger?.(d.interactionId, d.triggerId);
        }}
      />
      <Handle
        type="source"
        id="trigger-output"
        position={Position.Bottom}
        className="trigger-node-handle trigger-node-output"
      />
      {routingHandles.map((position) => (
        <Handle
          key={`output-${position}`}
          type="source"
          id={`routing-output-${position}`}
          position={position}
          className="routing-handle"
        />
      ))}
    </div>
  );
}
