import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import type { InteractionNodeData } from './components/InteractionNode';

export type InteractionFlowNode = Node<InteractionNodeData>;

export interface SelectedTrigger extends Record<string, unknown> {
  interactionId: string;
  triggerId: string;
  inputInteractionId?: string;
}

export interface TriggerEdgeData extends SelectedTrigger {
  selected: boolean;
  conditionCount: number;
  onSelectTrigger?: (trigger: SelectedTrigger) => void;
}

export type TriggerFlowEdge = Edge<TriggerEdgeData>;

export interface InteractionNodeActions {
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
  onSelectRootTrigger?: (interactionId: string, triggerId: string) => void;
}

export function buildInteractionNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  actions: InteractionNodeActions = {},
): InteractionFlowNode[] {
  return (
    story?.interactions.map((item) => {
      const rootTrigger = item.triggers.find((trigger) => trigger.inputInteractionIds.length === 0);
      return {
        id: item.id,
        type: 'interaction',
        position: item.position,
        data: {
          title: item.title,
          body: item.body,
          selected: item.id === selectedId,
          ...(rootTrigger ? { rootTriggerId: rootTrigger.id } : {}),
          ...(actions.onCreateChild ? { onCreateChild: actions.onCreateChild } : {}),
          ...(actions.onCreateParent ? { onCreateParent: actions.onCreateParent } : {}),
          ...(actions.onSelectRootTrigger
            ? { onSelectRootTrigger: actions.onSelectRootTrigger }
            : {}),
        },
      };
    }) ?? []
  );
}

export function buildTriggerEdges(
  story: Story | undefined,
  selectedTrigger?: SelectedTrigger,
  onSelectTrigger?: (trigger: SelectedTrigger) => void,
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
            type: 'trigger',
            source,
            target: target.id,
            markerEnd: { type: MarkerType.ArrowClosed },
            className: isSelected ? 'trigger-edge selected' : 'trigger-edge',
            data: {
              interactionId: target.id,
              triggerId: trigger.id,
              inputInteractionId: source,
              selected: isSelected,
              conditionCount: trigger.conditions.length,
              ...(onSelectTrigger ? { onSelectTrigger } : {}),
            },
          };
        }),
      ),
    ) ?? []
  );
}
