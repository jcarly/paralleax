import type { KeyboardEvent, MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
export interface InteractionNodeData extends Record<string, unknown> {
  title: string;
  body: string;
  selected: boolean;
  occurrenceCount?: number;
  dimmed?: boolean;
  rootTriggerId?: string;
  rootTriggerSelected?: boolean;
  showNewTriggerInput?: boolean;
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
  onSelectRootTrigger?: (interactionId: string, triggerId: string) => void;
}

const routingHandles = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function InteractionNode({ id, data }: NodeProps) {
  const d = data as InteractionNodeData;
  const createParent = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateParent?.(id);
  };
  const createChild = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateChild?.(id);
  };
  const selectRootTrigger = (event: MouseEvent<HTMLButtonElement>) => {
    if (!d.rootTriggerId) return;
    event.preventDefault();
    event.stopPropagation();
    d.onSelectRootTrigger?.(id, d.rootTriggerId);
  };
  const triggerKeyboardAction =
    (callback: (event: MouseEvent<HTMLDivElement>) => void) =>
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      callback(event as unknown as MouseEvent<HTMLDivElement>);
    };

  return (
    <div
      className={`interaction-node ${d.selected ? 'selected' : ''} ${d.dimmed ? 'dimmed' : ''}`}
      data-testid="interaction-node"
    >
      {d.rootTriggerId ? (
        <button
          className={`root-trigger-marker nodrag nopan ${d.rootTriggerSelected ? 'selected' : ''}`}
          type="button"
          data-trigger-drop-target="true"
          data-interaction-id={id}
          data-trigger-id={d.rootTriggerId}
          aria-label="Select root trigger"
          title="Root trigger"
          onClick={selectRootTrigger}
        />
      ) : null}
      <Handle
        type="target"
        id="create-source-input"
        position={Position.Top}
        className="node-create node-create-parent nodrag nopan"
        role="button"
        tabIndex={0}
        aria-label="Create source interaction"
        title="Create source interaction"
        onClick={createParent}
        onKeyDown={triggerKeyboardAction(createParent)}
      >
        +
      </Handle>
      {routingHandles.map((position) => (
        <Handle
          key={`input-${position}`}
          type="target"
          id={`routing-input-${position}`}
          position={position}
          className="routing-handle"
        />
      ))}
      <Handle
        type="target"
        id="new-trigger-input"
        position={Position.Top}
        className={`node-trigger-input nodrag nopan ${d.showNewTriggerInput ? 'is-visible' : ''}`}
        aria-label="Create new trigger input"
        title="Create new trigger"
      />
      <strong>
        {d.title}
        {d.occurrenceCount ? (
          <span
            className="interaction-occurrence-count"
            aria-label={`${d.occurrenceCount} occurrences`}
          >
            {d.occurrenceCount}
          </span>
        ) : null}
      </strong>
      <span>
        {d.body
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()}
      </span>
      <Handle
        type="source"
        id="interaction-output"
        position={Position.Bottom}
        className="node-create node-create-child nodrag nopan"
        role="button"
        tabIndex={0}
        aria-label="Create child interaction"
        title="Create child interaction"
        onClick={createChild}
        onKeyDown={triggerKeyboardAction(createChild)}
      >
        +
      </Handle>
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
