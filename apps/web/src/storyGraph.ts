import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import type { InteractionNodeData } from './components/InteractionNode';
import type { TriggerNodeData } from './components/TriggerNode';

export type InteractionFlowNode = Node<InteractionNodeData, 'interaction'>;
export type TriggerFlowNode = Node<TriggerNodeData, 'trigger'>;
export type StoryFlowNode = InteractionFlowNode | TriggerFlowNode;

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

export interface TriggerNodeActions {
  onSelectTrigger?: (interactionId: string, triggerId: string) => void;
}

const interactionNodeWidth = 220;
const interactionNodeHeight = 96;
const triggerNodeSize = 18;

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

export function buildTriggerNodes(
  story: Story | undefined,
  selectedTrigger?: SelectedTrigger,
  actions: TriggerNodeActions = {},
): TriggerFlowNode[] {
  return (
    story?.interactions.flatMap((target) =>
      target.triggers
        .filter((trigger) => trigger.inputInteractionIds.length > 0)
        .map((trigger, triggerIndex) => {
          const inputPositions = trigger.inputInteractionIds.flatMap((inputId) => {
            const input = story.interactions.find((item) => item.id === inputId);
            return input
              ? [
                  {
                    x: input.position.x + interactionNodeWidth,
                    y: input.position.y + interactionNodeHeight / 2,
                  },
                ]
              : [];
          });
          const averageInput = inputPositions.reduce(
            (acc, position) => ({ x: acc.x + position.x, y: acc.y + position.y }),
            { x: 0, y: 0 },
          );
          const inputCount = Math.max(inputPositions.length, 1);
          const targetAnchor = {
            x: target.position.x,
            y: target.position.y + interactionNodeHeight / 2,
          };
          const midpoint = {
            x: (averageInput.x / inputCount + targetAnchor.x) / 2,
            y: (averageInput.y / inputCount + targetAnchor.y) / 2,
          };
          const selected =
            selectedTrigger?.interactionId === target.id &&
            selectedTrigger.triggerId === trigger.id;

          return {
            id: getTriggerNodeId(target.id, trigger.id),
            type: 'trigger',
            position: {
              x: Math.round(midpoint.x - triggerNodeSize / 2),
              y: Math.round(midpoint.y - triggerNodeSize / 2 + triggerIndex * 24),
            },
            draggable: false,
            selectable: false,
            data: {
              interactionId: target.id,
              triggerId: trigger.id,
              selected,
              conditionCount: trigger.conditions.length,
              inputCount: trigger.inputInteractionIds.length,
              ...(actions.onSelectTrigger ? { onSelectTrigger: actions.onSelectTrigger } : {}),
            },
          };
        }),
    ) ?? []
  );
}

export function buildTriggerEdges(
  story: Story | undefined,
  selectedTrigger?: SelectedTrigger,
  onSelectTrigger?: (trigger: SelectedTrigger) => void,
): TriggerFlowEdge[] {
  return (
    story?.interactions.flatMap((target) =>
      target.triggers.flatMap((trigger) => {
        if (trigger.inputInteractionIds.length === 0) return [];
        const triggerNodeId = getTriggerNodeId(target.id, trigger.id);
        const isTriggerSelected =
          selectedTrigger?.interactionId === target.id &&
          selectedTrigger.triggerId === trigger.id &&
          !selectedTrigger.inputInteractionId;
        const inputEdges = trigger.inputInteractionIds.map((source) => {
          const isInputSelected =
            selectedTrigger?.interactionId === target.id &&
            selectedTrigger.triggerId === trigger.id &&
            selectedTrigger.inputInteractionId === source;
          return {
            id: `${trigger.id}-${source}`,
            type: 'trigger',
            source,
            sourceHandle: 'interaction-output',
            target: triggerNodeId,
            targetHandle: 'trigger-input',
            className: isInputSelected ? 'trigger-edge selected' : 'trigger-edge',
            data: {
              interactionId: target.id,
              triggerId: trigger.id,
              inputInteractionId: source,
              selected: isInputSelected,
              conditionCount: trigger.conditions.length,
              ...(onSelectTrigger ? { onSelectTrigger } : {}),
            },
          };
        });
        const outputEdge: TriggerFlowEdge = {
          id: `${trigger.id}-output`,
          type: 'trigger',
          source: triggerNodeId,
          sourceHandle: 'trigger-output',
          target: target.id,
          targetHandle: 'new-trigger-input',
          markerEnd: { type: MarkerType.ArrowClosed },
          className: isTriggerSelected ? 'trigger-edge selected' : 'trigger-edge',
          data: {
            interactionId: target.id,
            triggerId: trigger.id,
            selected: isTriggerSelected,
            conditionCount: trigger.conditions.length,
            ...(onSelectTrigger ? { onSelectTrigger } : {}),
          },
        };
        return [...inputEdges, outputEdge];
      }),
    ) ?? []
  );
}

export function getTriggerNodeId(interactionId: string, triggerId: string) {
  return `trigger:${interactionId}:${triggerId}`;
}
