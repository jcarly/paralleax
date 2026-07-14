import type { MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
export interface InteractionNodeData extends Record<string, unknown> {
  title: string;
  body: string;
  selected: boolean;
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
}
export function InteractionNode({ id, data }: NodeProps) {
  const d = data as InteractionNodeData;
  const createParent = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateParent?.(id);
  };
  const createChild = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateChild?.(id);
  };

  return (
    <div
      className={`interaction-node ${d.selected ? 'selected' : ''}`}
      data-testid="interaction-node"
    >
      <Handle type="target" position={Position.Left} />
      <button
        className="node-create node-create-parent nodrag nopan"
        type="button"
        aria-label="Create source interaction"
        title="Create source interaction"
        onClick={createParent}
      >
        +
      </button>
      <strong>{d.title}</strong>
      <span>{d.body}</span>
      <button
        className="node-create node-create-child nodrag nopan"
        type="button"
        aria-label="Create child interaction"
        title="Create child interaction"
        onClick={createChild}
      >
        +
      </button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
