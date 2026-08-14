import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import type { InteractionNodeData } from './components/InteractionNode';
import type { TriggerNodeData } from './components/TriggerNode';
import type { CommentPinFlowNode } from './features/comments/CommentPinNode';

export type InteractionFlowNode = Node<InteractionNodeData, 'interaction'>;
export type TriggerFlowNode = Node<TriggerNodeData, 'trigger'>;
export type StoryFlowNode = InteractionFlowNode | TriggerFlowNode | CommentPinFlowNode;

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
  occurrenceCounts?: ReadonlyMap<string, number>;
  emphasizedInteractionIds?: ReadonlySet<string>;
  commentCounts?: ReadonlyMap<string, number>;
  onOpenComments?: (targetType: 'interaction' | 'trigger', targetId: string) => void;
}

export interface TriggerNodeActions {
  onSelectTrigger?: (interactionId: string, triggerId: string) => void;
  commentCounts?: ReadonlyMap<string, number>;
  onOpenComments?: (targetType: 'trigger', targetId: string) => void;
}

export const interactionNodeWidth = 210;
const interactionNodeHeight = 116;
const triggerNodeSize = 20;
const fallbackInteractionX = 80;
const fallbackInteractionY = 120;
const fallbackInteractionVerticalGap = 132;
const triggerOutputMarker = { type: MarkerType.ArrowClosed, color: '#8d918f' } as const;

export function buildInteractionNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  selectedTrigger?: SelectedTrigger,
  actions: InteractionNodeActions = {},
): InteractionFlowNode[] {
  if (!story) return [];
  const locationsById = new Map((story.locations ?? []).map((location) => [location.id, location]));
  const charactersById = new Map(
    (story.characters ?? []).map((character) => [character.id, character]),
  );

  return story.interactions.map((item, index) => {
    const rootTrigger = item.triggers.find((trigger) => trigger.inputInteractionIds.length === 0);
    const location = item.locationId ? locationsById.get(item.locationId) : undefined;
    const characters = (item.characterIds ?? []).flatMap((characterId) => {
      const character = charactersById.get(characterId);
      return character
        ? [
            {
              id: character.id,
              name: character.name,
              ...(character.imageUrl ? { imageUrl: character.imageUrl } : {}),
            },
          ]
        : [];
    });
    return {
      id: item.id,
      type: 'interaction',
      position: getInteractionPosition(item, index),
      data: {
        title: item.title,
        body: item.body,
        selected: item.id === selectedId,
        ...(location ? { location: { id: location.id, name: location.name } } : {}),
        ...(characters.length > 0 ? { characters } : {}),
        ...(actions.occurrenceCounts?.get(item.id)
          ? { occurrenceCount: actions.occurrenceCounts.get(item.id) }
          : {}),
        ...(actions.emphasizedInteractionIds
          ? { dimmed: !actions.emphasizedInteractionIds.has(item.id) }
          : {}),
        showNewTriggerInput: actions.showNewTriggerInput ?? false,
        ...(rootTrigger
          ? {
              rootTriggerId: rootTrigger.id,
              ...(actions.commentCounts?.get(rootTrigger.id)
                ? { rootTriggerCommentCount: actions.commentCounts.get(rootTrigger.id) }
                : {}),
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
        ...(actions.commentCounts?.get(item.id)
          ? { commentCount: actions.commentCounts.get(item.id) }
          : {}),
        ...(actions.onOpenComments ? { onOpenComments: actions.onOpenComments } : {}),
      },
    };
  });
}

export function buildTriggerNodes(
  story: Story | undefined,
  selectedTrigger?: SelectedTrigger,
  actions: TriggerNodeActions = {},
): TriggerFlowNode[] {
  return (
    story?.interactions.flatMap((target, targetIndex) =>
      getLinkedTriggerGroups(target).map((group, triggerIndex) => {
        const position = getTriggerNodePosition(story, target, targetIndex, group, triggerIndex);
        const triggerIds = group.triggers.map((trigger) => trigger.id);
        const selected =
          selectedTrigger?.interactionId === target.id &&
          Boolean(selectedTrigger.triggerId && triggerIds.includes(selectedTrigger.triggerId));

        return {
          id: getTriggerNodeId(target.id, group.primaryTrigger.id),
          type: 'trigger',
          position,
          draggable: true,
          selectable: false,
          data: {
            interactionId: target.id,
            triggerId: group.primaryTrigger.id,
            triggerIds,
            selected,
            conditionCount: getTotalConditionCount(group.triggers),
            inputCount: group.inputInteractionIds.length,
            orGroupCount: group.triggers.length,
            ...(triggerIds.reduce(
              (total, triggerId) => total + (actions.commentCounts?.get(triggerId) ?? 0),
              0,
            ) > 0
              ? {
                  commentCount: triggerIds.reduce(
                    (total, triggerId) => total + (actions.commentCounts?.get(triggerId) ?? 0),
                    0,
                  ),
                }
              : {}),
            ...(triggerIds.find((triggerId) => (actions.commentCounts?.get(triggerId) ?? 0) > 0)
              ? {
                  commentTargetId: triggerIds.find(
                    (triggerId) => (actions.commentCounts?.get(triggerId) ?? 0) > 0,
                  ),
                }
              : {}),
            ...(actions.onSelectTrigger ? { onSelectTrigger: actions.onSelectTrigger } : {}),
            ...(actions.onOpenComments ? { onOpenComments: actions.onOpenComments } : {}),
          },
        };
      }),
    ) ?? []
  );
}

function getInteractionPosition(interaction: Story['interactions'][number], index: number) {
  if (
    typeof interaction.position?.x === 'number' &&
    Number.isFinite(interaction.position.x) &&
    typeof interaction.position?.y === 'number' &&
    Number.isFinite(interaction.position.y)
  ) {
    return interaction.position;
  }

  return {
    x: fallbackInteractionX,
    y: fallbackInteractionY + Math.max(index, 0) * fallbackInteractionVerticalGap,
  };
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
    story?.interactions.flatMap((target, targetIndex) =>
      getLinkedTriggerGroups(target).flatMap((group, triggerIndex) => {
        const triggerNodeId = getTriggerNodeId(target.id, group.primaryTrigger.id);
        const triggerPosition = getTriggerNodePosition(
          story,
          target,
          targetIndex,
          group,
          triggerIndex,
        );
        const triggerCenter = {
          x: triggerPosition.x + triggerNodeSize / 2,
          y: triggerPosition.y + triggerNodeSize / 2,
        };
        const triggerIds = group.triggers.map((trigger) => trigger.id);
        const conditionCount = getTotalConditionCount(group.triggers);
        const inputEdges = group.inputInteractionIds.map((source) => {
          const sourceIndex = story.interactions.findIndex((item) => item.id === source);
          const sourceInteraction = story.interactions[sourceIndex];
          const handles = getRoutingHandleIds(
            sourceInteraction
              ? getInteractionCenter(sourceInteraction, sourceIndex)
              : triggerCenter,
            triggerCenter,
          );
          return {
            id: `${triggerNodeId}-${source}`,
            type: 'trigger',
            source,
            sourceHandle: handles.sourceHandle,
            target: triggerNodeId,
            targetHandle: handles.targetHandle,
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
        const targetCenter = getInteractionCenter(target, targetIndex);
        const outputHandles = getRoutingHandleIds(triggerCenter, targetCenter);
        const outputEdge: TriggerFlowEdge = {
          id: `${triggerNodeId}-output`,
          type: 'trigger',
          source: triggerNodeId,
          sourceHandle: outputHandles.sourceHandle,
          target: target.id,
          targetHandle: outputHandles.targetHandle,
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

function getInteractionCenter(interaction: Story['interactions'][number], index: number) {
  const position = getInteractionPosition(interaction, index);
  return {
    x: position.x + interactionNodeWidth / 2,
    y: position.y + interactionNodeHeight / 2,
  };
}

function getTriggerNodePosition(
  story: Story,
  target: Story['interactions'][number],
  targetIndex: number,
  group: LinkedTriggerGroup,
  triggerIndex: number,
) {
  const savedPosition = group.triggers.find(
    (trigger) =>
      typeof trigger.position?.x === 'number' &&
      Number.isFinite(trigger.position.x) &&
      typeof trigger.position?.y === 'number' &&
      Number.isFinite(trigger.position.y),
  )?.position;
  if (savedPosition) return savedPosition;

  const inputCenters = group.inputInteractionIds.flatMap((inputId) => {
    const inputIndex = story.interactions.findIndex((item) => item.id === inputId);
    const input = story.interactions[inputIndex];
    return input ? [getInteractionCenter(input, inputIndex)] : [];
  });
  const averageInput = inputCenters.reduce(
    (acc, position) => ({ x: acc.x + position.x, y: acc.y + position.y }),
    { x: 0, y: 0 },
  );
  const inputCount = Math.max(inputCenters.length, 1);
  const targetCenter = getInteractionCenter(target, targetIndex);

  return {
    x: Math.round((averageInput.x / inputCount + targetCenter.x) / 2 - triggerNodeSize / 2),
    y: Math.round(
      (averageInput.y / inputCount + targetCenter.y) / 2 - triggerNodeSize / 2 + triggerIndex * 24,
    ),
  };
}

export function getRoutingHandleIds(
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  const horizontalDistance = target.x - source.x;
  const verticalDistance = target.y - source.y;
  let sourcePosition: Position;
  let targetPosition: Position;

  if (Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.6) {
    sourcePosition = horizontalDistance >= 0 ? Position.Right : Position.Left;
    targetPosition = horizontalDistance >= 0 ? Position.Left : Position.Right;
  } else {
    sourcePosition = verticalDistance >= 0 ? Position.Bottom : Position.Top;
    targetPosition = verticalDistance >= 0 ? Position.Top : Position.Bottom;
  }

  return {
    sourceHandle: `routing-output-${sourcePosition}`,
    targetHandle: `routing-input-${targetPosition}`,
  };
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
