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
  triggerIds?: string[];
  onSelectTrigger?: (trigger: SelectedTrigger) => void;
  onDeleteTriggerInput?: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => void;
}

export type TriggerFlowEdge = Edge<TriggerEdgeData>;

export interface InteractionNodeActions {
  showNewTriggerInput?: boolean;
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
          showNewTriggerInput: actions.showNewTriggerInput ?? false,
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
      getLinkedTriggerGroups(target).map((group, triggerIndex) => {
        const inputPositions = group.inputInteractionIds.flatMap((inputId) => {
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
        const triggerIds = group.triggers.map((trigger) => trigger.id);
        const selected =
          selectedTrigger?.interactionId === target.id &&
          Boolean(selectedTrigger.triggerId && triggerIds.includes(selectedTrigger.triggerId));

        return {
          id: getTriggerNodeId(target.id, group.primaryTrigger.id),
          type: 'trigger',
          position: {
            x: Math.round(midpoint.x - triggerNodeSize / 2),
            y: Math.round(midpoint.y - triggerNodeSize / 2 + triggerIndex * 24),
          },
          draggable: false,
          selectable: false,
          data: {
            interactionId: target.id,
            triggerId: group.primaryTrigger.id,
            triggerIds,
            selected,
            conditionCount: getTotalConditionCount(group.triggers),
            inputCount: group.inputInteractionIds.length,
            orGroupCount: group.triggers.length,
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
      getLinkedTriggerGroups(target).flatMap((group) => {
        const triggerNodeId = getTriggerNodeId(target.id, group.primaryTrigger.id);
        const triggerIds = group.triggers.map((trigger) => trigger.id);
        const conditionCount = getTotalConditionCount(group.triggers);
        const inputEdges = group.inputInteractionIds.map((source) => {
          return {
            id: `${triggerNodeId}-${source}`,
            type: 'trigger',
            source,
            sourceHandle: 'interaction-output',
            target: triggerNodeId,
            targetHandle: 'trigger-input',
            className: 'trigger-edge',
            data: {
              interactionId: target.id,
              triggerId: group.primaryTrigger.id,
              triggerIds,
              inputInteractionId: source,
              selected: false,
              conditionCount,
              ...(onSelectTrigger ? { onSelectTrigger } : {}),
              ...(onDeleteTriggerInput ? { onDeleteTriggerInput } : {}),
            },
          };
        });
        const outputEdge: TriggerFlowEdge = {
          id: `${triggerNodeId}-output`,
          type: 'trigger',
          source: triggerNodeId,
          sourceHandle: 'trigger-output',
          target: target.id,
          targetHandle: 'create-source-input',
          markerEnd: triggerOutputMarker,
          className: 'trigger-edge',
          data: {
            interactionId: target.id,
            triggerId: group.primaryTrigger.id,
            triggerIds,
            selected: false,
            conditionCount,
            ...(onSelectTrigger ? { onSelectTrigger } : {}),
          },
        };
        return [...inputEdges, outputEdge];
      }),
    ) ?? []
  );
}

interface LinkedTriggerGroup {
  inputInteractionIds: string[];
  primaryTrigger: Story['interactions'][number]['triggers'][number];
  triggers: Story['interactions'][number]['triggers'];
}

function getLinkedTriggerGroups(interaction: Story['interactions'][number]): LinkedTriggerGroup[] {
  const groups = new Map<string, LinkedTriggerGroup>();

  interaction.triggers
    .filter((trigger) => trigger.inputInteractionIds.length > 0)
    .forEach((trigger) => {
      const key = getTriggerGroupKey(trigger.inputInteractionIds);
      const existing = groups.get(key);
      if (existing) {
        existing.triggers.push(trigger);
        return;
      }

      groups.set(key, {
        inputInteractionIds: [...trigger.inputInteractionIds],
        primaryTrigger: trigger,
        triggers: [trigger],
      });
    });

  return [...groups.values()];
}

function getTriggerGroupKey(inputInteractionIds: string[]) {
  return [...inputInteractionIds].sort().join('|');
}

function getTotalConditionCount(triggers: Story['interactions'][number]['triggers']) {
  return triggers.reduce((total, trigger) => total + trigger.conditions.length, 0);
}

export function getRelatedTriggerVariantIds(
  interaction: Story['interactions'][number],
  trigger: Story['interactions'][number]['triggers'][number],
): string[] {
  if (trigger.inputInteractionIds.length === 0) return [trigger.id];

  const key = getTriggerGroupKey(trigger.inputInteractionIds);
  return interaction.triggers
    .filter((candidate) => candidate.inputInteractionIds.length > 0)
    .filter((candidate) => getTriggerGroupKey(candidate.inputInteractionIds) === key)
    .map((candidate) => candidate.id);
}

export function getTriggerNodeId(interactionId: string, triggerId: string) {
  return `trigger:${interactionId}:${triggerId}`;
}
