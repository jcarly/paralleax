import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import type { InteractionNodeData } from './components/InteractionNode';

export type InteractionFlowNode = Node<InteractionNodeData>;

export interface SelectedTrigger extends Record<string, unknown> {
  interactionId: string;
  triggerId: string;
  inputInteractionId?: string;
}

export type TriggerFlowEdge = Edge<SelectedTrigger>;

export interface InteractionNodeActions {
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
}

export function buildInteractionNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  actions: InteractionNodeActions = {},
): InteractionFlowNode[] {
  return (
    story?.interactions.map((item) => ({
      id: item.id,
      type: 'interaction',
      position: item.position,
      data: {
        title: item.title,
        body: item.body,
        selected: item.id === selectedId,
        ...(actions.onCreateChild ? { onCreateChild: actions.onCreateChild } : {}),
        ...(actions.onCreateParent ? { onCreateParent: actions.onCreateParent } : {}),
      },
    })) ?? []
  );
}

export function buildTriggerEdges(
  story: Story | undefined,
  selectedTrigger?: SelectedTrigger,
): TriggerFlowEdge[] {
  return (
    story?.interactions.flatMap((target) =>
      target.triggers.flatMap((trigger) =>
        trigger.inputInteractionIds.map((source) => {
          const isSelected =
            selectedTrigger?.interactionId === target.id &&
            selectedTrigger.triggerId === trigger.id &&
            selectedTrigger.inputInteractionId === source;
          return {
            id: `${trigger.id}-${source}`,
            source,
            target: target.id,
            markerEnd: { type: MarkerType.ArrowClosed },
            label: trigger.conditions.length
              ? `${trigger.conditions.length} condition(s)`
              : undefined,
            className: isSelected ? 'trigger-edge selected' : 'trigger-edge',
            data: { interactionId: target.id, triggerId: trigger.id, inputInteractionId: source },
          };
        }),
      ),
    ) ?? []
  );
}
