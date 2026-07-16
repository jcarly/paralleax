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
  onDeleteTriggerInput?: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => void;
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

export const interactionNodeWidth = 210;
const interactionNodeHeight = 96;
const triggerNodeSize = 18;
const triggerOutputMarker = { type: MarkerType.ArrowClosed, color: '#8d918f' } as const;

export function buildInteractionNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  selectedTrigger?: SelectedTrigger,
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
          ...(rootTrigger
            ? {
                rootTriggerId: rootTrigger.id,
                rootTriggerSelected:
                  selectedTrigger?.interactionId === item.id &&
                  selectedTrigger.triggerId === rootTrigger.id,
              }
            : {}),
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
                    x: input.position.x + interactionNodeWidth / 2,
                    y: input.position.y + interactionNodeHeight,
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
            x: target.position.x + interactionNodeWidth / 2,
            y: target.position.y,
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
  onSelectTrigger?: (trigger: SelectedTrigger) => void,
  onDeleteTriggerInput?: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => void,
): TriggerFlowEdge[] {
  return (
    story?.interactions.flatMap((target) =>
      target.triggers.flatMap((trigger) => {
        if (trigger.inputInteractionIds.length === 0) return [];
        const triggerNodeId = getTriggerNodeId(target.id, trigger.id);
        const inputEdges = trigger.inputInteractionIds.map((source) => {
          return {
            id: `${trigger.id}-${source}`,
            type: 'trigger',
            source,
            sourceHandle: 'interaction-output',
            target: triggerNodeId,
            targetHandle: 'trigger-input',
            className: 'trigger-edge',
            data: {
              interactionId: target.id,
              triggerId: trigger.id,
              inputInteractionId: source,
              selected: false,
              conditionCount: trigger.conditions.length,
              ...(onSelectTrigger ? { onSelectTrigger } : {}),
              ...(onDeleteTriggerInput ? { onDeleteTriggerInput } : {}),
            },
          };
        });
        const outputEdge: TriggerFlowEdge = {
          id: `${trigger.id}-output`,
          type: 'trigger',
          source: triggerNodeId,
          sourceHandle: 'trigger-output',
          target: target.id,
          targetHandle: 'create-source-input',
          markerEnd: triggerOutputMarker,
          className: 'trigger-edge',
          data: {
            interactionId: target.id,
            triggerId: trigger.id,
            selected: false,
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
