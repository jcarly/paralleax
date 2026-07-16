import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface TriggerNodeData extends Record<string, unknown> {
  interactionId: string;
  triggerId: string;
  conditionCount: number;
  inputCount: number;
  selected: boolean;
  onSelectTrigger?: (interactionId: string, triggerId: string) => void;
}

export function TriggerNode({ data }: NodeProps) {
  const d = data as TriggerNodeData;
  const conditionLabel = d.conditionCount ? `${d.conditionCount} condition(s)` : 'No conditions';
  const inputLabel = `${d.inputCount} input${d.inputCount === 1 ? '' : 's'}`;

  return (
    <div className="trigger-node">
      <Handle
        type="target"
        id="trigger-input"
        position={Position.Top}
        className="trigger-node-handle trigger-node-input"
      />
      <button
        type="button"
        className={`trigger-marker nodrag nopan ${d.selected ? 'selected' : ''}`}
        data-trigger-drop-target="true"
        data-interaction-id={d.interactionId}
        data-trigger-id={d.triggerId}
        data-testid={`flow-trigger-${d.interactionId}-${d.triggerId}`}
        aria-label={`Trigger, ${inputLabel}, ${conditionLabel}`}
        title={`${inputLabel}, ${conditionLabel}`}
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
    </div>
  );
}
