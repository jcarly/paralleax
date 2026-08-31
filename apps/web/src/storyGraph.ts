import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import {
  getTriggerConditions,
  type Story,
  type StoryGraphTriggerPositionUpdate,
} from '@paralleax/shared';
import type { InteractionNodeData } from './components/InteractionNode';
import type { TriggerNodeData } from './components/TriggerNode';
import type { CommentPinFlowNode } from './features/comments/CommentPinNode';
import type { GraphDecorationFlowNode } from './features/graph-decorations/GraphDecorationNode';

export type InteractionFlowNode = Node<InteractionNodeData, 'interaction'>;
export type TriggerFlowNode = Node<TriggerNodeData, 'trigger'>;
export type StoryFlowNode =
  InteractionFlowNode | TriggerFlowNode | GraphDecorationFlowNode | CommentPinFlowNode;

export interface SelectedTrigger extends Record<string, unknown> {
  interactionId: string;
  triggerId: string;
  inputInteractionId?: string;
}

export interface TriggerEdgeData extends SelectedTrigger {
  selected: boolean;
  conditionCount: number;
  routingLaneIndex?: number;
  routingLaneCount?: number;
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
export const interactionNodeHeight = 116;
const triggerNodeSize = 20;
const routingLaneBandSize = 80;
const fallbackInteractionX = 80;
const fallbackInteractionY = 120;
const fallbackInteractionVerticalGap = 132;
const triggerOutputMarker = { type: MarkerType.ArrowClosed, color: '#8d918f' } as const;
const minimumSavedTriggerFollowRatio = 0.25;
const savedTriggerFollowRatioRange = 0.5;
const savedTriggerFollowDistanceScale = 240;
const storyInteractionIndexes = new WeakMap<
  Story,
  ReadonlyMap<string, { interaction: Story['interactions'][number]; index: number }>
>();

export type TriggerPositionUpdate = StoryGraphTriggerPositionUpdate;

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
          selectable: true,
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

export function applyInteractionDragTriggerPreview(
  nodes: StoryFlowNode[],
  story: Story | undefined,
  interactionId: string,
  position: { x: number; y: number },
): StoryFlowNode[] {
  return applyInteractionMovesTriggerPreview(nodes, story, new Map([[interactionId, position]]));
}

export function applyInteractionMovesTriggerPreview(
  nodes: StoryFlowNode[],
  story: Story | undefined,
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
  directlyMovedTriggerNodeIds: ReadonlySet<string> = new Set(),
): StoryFlowNode[] {
  if (
    !story ||
    positionOverrides.size === 0 ||
    !story.interactions.some((interaction) => positionOverrides.has(interaction.id))
  ) {
    return nodes;
  }

  const previewPositions = new Map<string, { x: number; y: number }>();

  story.interactions.forEach((target, targetIndex) => {
    const affectsTarget =
      positionOverrides.has(target.id) ||
      target.triggers.some((trigger) =>
        trigger.inputInteractionIds.some((inputId) => positionOverrides.has(inputId)),
      );
    if (!affectsTarget) return;

    getLinkedTriggerGroups(target).forEach((group, triggerIndex) => {
      if (
        !positionOverrides.has(target.id) &&
        !group.inputInteractionIds.some((inputId) => positionOverrides.has(inputId))
      ) {
        return;
      }
      const triggerNodeId = getTriggerNodeId(target.id, group.primaryTrigger.id);
      if (directlyMovedTriggerNodeIds.has(triggerNodeId)) return;
      previewPositions.set(
        triggerNodeId,
        getTriggerNodePosition(story, target, targetIndex, group, triggerIndex, positionOverrides),
      );
    });
  });

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.type !== 'trigger') return node;
    const nextPosition = previewPositions.get(node.id);
    if (
      !nextPosition ||
      (node.position.x === nextPosition.x && node.position.y === nextPosition.y)
    ) {
      return node;
    }
    changed = true;
    return { ...node, position: nextPosition };
  });

  return changed ? nextNodes : nodes;
}

export function applyInteractionDragEdgePreview(
  edges: TriggerFlowEdge[],
  story: Story | undefined,
  interactionId: string,
  position: { x: number; y: number },
): TriggerFlowEdge[] {
  return applyInteractionMovesEdgePreview(edges, story, new Map([[interactionId, position]]));
}

export function applyInteractionMovesEdgePreview(
  edges: TriggerFlowEdge[],
  story: Story | undefined,
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
): TriggerFlowEdge[] {
  if (
    !story ||
    positionOverrides.size === 0 ||
    !story.interactions.some((interaction) => positionOverrides.has(interaction.id))
  ) {
    return edges;
  }

  const previewHandles = new Map<string, Pick<TriggerFlowEdge, 'sourceHandle' | 'targetHandle'>>();

  story.interactions.forEach((target, targetIndex) => {
    const affectsTarget =
      positionOverrides.has(target.id) ||
      target.triggers.some((trigger) =>
        trigger.inputInteractionIds.some((inputId) => positionOverrides.has(inputId)),
      );
    if (!affectsTarget) return;

    getLinkedTriggerGroups(target).forEach((group, triggerIndex) => {
      if (
        !positionOverrides.has(target.id) &&
        !group.inputInteractionIds.some((inputId) => positionOverrides.has(inputId))
      ) {
        return;
      }
      const triggerNodeId = getTriggerNodeId(target.id, group.primaryTrigger.id);
      const triggerPosition = getTriggerNodePosition(
        story,
        target,
        targetIndex,
        group,
        triggerIndex,
        positionOverrides,
      );
      const triggerCenter = {
        x: triggerPosition.x + triggerNodeSize / 2,
        y: triggerPosition.y + triggerNodeSize / 2,
      };

      group.inputInteractionIds.forEach((sourceId) => {
        const sourceEntry = getIndexedStoryInteraction(story, sourceId);
        if (!sourceEntry) return;
        const { interaction: source, index: sourceIndex } = sourceEntry;
        previewHandles.set(
          `${triggerNodeId}-${sourceId}`,
          constrainInteractionOutputHandle(
            getRoutingHandleIds(
              getInteractionCenter(source, sourceIndex, positionOverrides.get(source.id)),
              triggerCenter,
            ),
            getInteractionCenter(source, sourceIndex, positionOverrides.get(source.id)),
            triggerCenter,
          ),
        );
      });

      previewHandles.set(
        `${triggerNodeId}-output`,
        constrainInteractionInputHandle(
          getRoutingHandleIds(
            triggerCenter,
            getInteractionCenter(target, targetIndex, positionOverrides.get(target.id)),
          ),
          triggerCenter,
          getInteractionCenter(target, targetIndex, positionOverrides.get(target.id)),
        ),
      );
    });
  });

  let changed = false;
  const nextEdges = edges.map((edge) => {
    const nextHandles = previewHandles.get(edge.id);
    if (
      !nextHandles ||
      (edge.sourceHandle === nextHandles.sourceHandle &&
        edge.targetHandle === nextHandles.targetHandle)
    ) {
      return edge;
    }
    changed = true;
    return { ...edge, ...nextHandles };
  });

  return changed ? nextEdges : edges;
}

export function getInteractionDragTriggerPositionUpdates(
  story: Story | undefined,
  interactionId: string,
  position: { x: number; y: number },
): TriggerPositionUpdate[] {
  return getInteractionMovesTriggerPositionUpdates(story, new Map([[interactionId, position]]));
}

export function getInteractionMovesTriggerPositionUpdates(
  story: Story | undefined,
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
): TriggerPositionUpdate[] {
  if (
    !story ||
    positionOverrides.size === 0 ||
    !story.interactions.some((interaction) => positionOverrides.has(interaction.id))
  ) {
    return [];
  }

  const updates: TriggerPositionUpdate[] = [];

  story.interactions.forEach((target, targetIndex) => {
    const affectsTarget =
      positionOverrides.has(target.id) ||
      target.triggers.some((trigger) =>
        trigger.inputInteractionIds.some((inputId) => positionOverrides.has(inputId)),
      );
    if (!affectsTarget) return;

    getLinkedTriggerGroups(target).forEach((group, triggerIndex) => {
      if (
        !positionOverrides.has(target.id) &&
        !group.inputInteractionIds.some((inputId) => positionOverrides.has(inputId))
      ) {
        return;
      }
      const savedPosition = getSavedTriggerNodePosition(group);
      if (!savedPosition) return;
      const nextPosition = getTriggerNodePosition(
        story,
        target,
        targetIndex,
        group,
        triggerIndex,
        positionOverrides,
      );
      if (nextPosition.x === savedPosition.x && nextPosition.y === savedPosition.y) return;
      updates.push({
        interactionId: target.id,
        triggerIds: group.triggers.map((trigger) => trigger.id),
        position: nextPosition,
      });
    });
  });

  return updates;
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
  const edges =
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
          const sourceEntry = getIndexedStoryInteraction(story, source);
          const sourceCenter = sourceEntry
            ? getInteractionCenter(sourceEntry.interaction, sourceEntry.index)
            : triggerCenter;
          const handles = constrainInteractionOutputHandle(
            getRoutingHandleIds(sourceCenter, triggerCenter),
            sourceCenter,
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
        const outputHandles = constrainInteractionInputHandle(
          getRoutingHandleIds(triggerCenter, targetCenter),
          triggerCenter,
          targetCenter,
        );
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
    ) ?? [];
  return assignRoutingLanes(story, edges);
}

function assignRoutingLanes(story: Story | undefined, edges: TriggerFlowEdge[]) {
  if (!story || edges.length < 2) return edges;
  const centers = new Map<string, { x: number; y: number }>();
  story.interactions.forEach((interaction, index) => {
    centers.set(interaction.id, getInteractionCenter(interaction, index));
    getLinkedTriggerGroups(interaction).forEach((group, triggerIndex) => {
      const position = getTriggerNodePosition(story, interaction, index, group, triggerIndex);
      centers.set(getTriggerNodeId(interaction.id, group.primaryTrigger.id), {
        x: position.x + triggerNodeSize / 2,
        y: position.y + triggerNodeSize / 2,
      });
    });
  });

  const groups = new Map<
    string,
    Array<{
      edge: TriggerFlowEdge;
      source: { x: number; y: number };
      target: { x: number; y: number };
    }>
  >();
  for (const edge of edges) {
    const source = centers.get(edge.source);
    const target = centers.get(edge.target);
    if (!source || !target) continue;
    const key = [
      Math.round(source.y / routingLaneBandSize),
      Math.round(target.y / routingLaneBandSize),
      edge.sourceHandle,
      edge.targetHandle,
    ].join(':');
    groups.set(key, [...(groups.get(key) ?? []), { edge, source, target }]);
  }

  const lanes = new Map<string, { index: number; count: number }>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort(
      (left, right) =>
        Math.min(left.source.x, left.target.x) - Math.min(right.source.x, right.target.x) ||
        Math.max(left.source.x, left.target.x) - Math.max(right.source.x, right.target.x) ||
        left.edge.id.localeCompare(right.edge.id),
    );
    group.forEach(({ edge }, index) => lanes.set(edge.id, { index, count: group.length }));
  }

  if (lanes.size === 0) return edges;
  return edges.map((edge) => {
    const lane = lanes.get(edge.id);
    return lane && edge.data
      ? {
          ...edge,
          data: {
            ...edge.data,
            routingLaneIndex: lane.index,
            routingLaneCount: lane.count,
          },
        }
      : edge;
  });
}

function getInteractionCenter(
  interaction: Story['interactions'][number],
  index: number,
  positionOverride?: { x: number; y: number },
) {
  const position = positionOverride ?? getInteractionPosition(interaction, index);
  return {
    x: position.x + interactionNodeWidth / 2,
    y: position.y + interactionNodeHeight / 2,
  };
}

export function getTriggerNodePosition(
  story: Story,
  target: Story['interactions'][number],
  targetIndex: number,
  group: LinkedTriggerGroup,
  triggerIndex: number,
  interactionPositionOverrides?: ReadonlyMap<string, { x: number; y: number }>,
) {
  const savedPosition = getSavedTriggerNodePosition(group);
  if (!interactionPositionOverrides || interactionPositionOverrides.size === 0) {
    if (savedPosition) return savedPosition;
  }

  const automaticPosition = getAutomaticTriggerNodePosition(
    story,
    target,
    targetIndex,
    group,
    triggerIndex,
    interactionPositionOverrides,
  );
  if (!savedPosition) return automaticPosition;

  const originalAutomaticPosition = getAutomaticTriggerNodePosition(
    story,
    target,
    targetIndex,
    group,
    triggerIndex,
  );
  const automaticDelta = {
    x: automaticPosition.x - originalAutomaticPosition.x,
    y: automaticPosition.y - originalAutomaticPosition.y,
  };
  if (automaticDelta.x === 0 && automaticDelta.y === 0) return savedPosition;

  const manualOffsetDistance = Math.hypot(
    savedPosition.x - originalAutomaticPosition.x,
    savedPosition.y - originalAutomaticPosition.y,
  );
  const followRatio =
    minimumSavedTriggerFollowRatio +
    savedTriggerFollowRatioRange / (1 + manualOffsetDistance / savedTriggerFollowDistanceScale);

  return {
    x: Math.round(savedPosition.x + automaticDelta.x * followRatio),
    y: Math.round(savedPosition.y + automaticDelta.y * followRatio),
  };
}

function getSavedTriggerNodePosition(group: LinkedTriggerGroup) {
  return group.triggers.find(
    (trigger) =>
      typeof trigger.position?.x === 'number' &&
      Number.isFinite(trigger.position.x) &&
      typeof trigger.position?.y === 'number' &&
      Number.isFinite(trigger.position.y),
  )?.position;
}

export function getAutomaticTriggerNodePosition(
  story: Story,
  target: Story['interactions'][number],
  targetIndex: number,
  group: LinkedTriggerGroup,
  triggerIndex: number,
  interactionPositionOverrides?: ReadonlyMap<string, { x: number; y: number }>,
) {
  const inputCenters = group.inputInteractionIds.flatMap((inputId) => {
    const inputEntry = getIndexedStoryInteraction(story, inputId);
    return inputEntry
      ? [
          getInteractionCenter(
            inputEntry.interaction,
            inputEntry.index,
            interactionPositionOverrides?.get(inputEntry.interaction.id),
          ),
        ]
      : [];
  });
  const averageInput = inputCenters.reduce(
    (acc, position) => ({ x: acc.x + position.x, y: acc.y + position.y }),
    { x: 0, y: 0 },
  );
  const inputCount = Math.max(inputCenters.length, 1);
  const targetCenter = getInteractionCenter(
    target,
    targetIndex,
    interactionPositionOverrides?.get(target.id),
  );

  return {
    x: Math.round((averageInput.x / inputCount + targetCenter.x) / 2 - triggerNodeSize / 2),
    y: Math.round(
      (averageInput.y / inputCount + targetCenter.y) / 2 - triggerNodeSize / 2 + triggerIndex * 24,
    ),
  };
}

function getIndexedStoryInteraction(story: Story, interactionId: string) {
  let index = storyInteractionIndexes.get(story);
  if (!index) {
    index = new Map(
      story.interactions.map((interaction, interactionIndex) => [
        interaction.id,
        { interaction, index: interactionIndex },
      ]),
    );
    storyInteractionIndexes.set(story, index);
  }
  return index.get(interactionId);
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

function constrainInteractionOutputHandle(
  handles: ReturnType<typeof getRoutingHandleIds>,
  source: { x: number; y: number },
  target: { x: number; y: number },
): ReturnType<typeof getRoutingHandleIds> {
  const verticalDistance = target.y - source.y;
  return {
    ...handles,
    sourceHandle: `routing-output-${Position.Bottom}`,
    ...(Math.abs(verticalDistance) > 1
      ? {
          targetHandle: `routing-input-${verticalDistance > 0 ? Position.Top : Position.Bottom}`,
        }
      : {}),
  };
}

function constrainInteractionInputHandle(
  handles: ReturnType<typeof getRoutingHandleIds>,
  source: { x: number; y: number },
  target: { x: number; y: number },
): ReturnType<typeof getRoutingHandleIds> {
  const verticalDistance = target.y - source.y;
  return {
    ...handles,
    ...(Math.abs(verticalDistance) > 1
      ? {
          sourceHandle: `routing-output-${verticalDistance > 0 ? Position.Bottom : Position.Top}`,
        }
      : {}),
    targetHandle: `routing-input-${Position.Top}`,
  };
}

export interface LinkedTriggerGroup {
  inputInteractionIds: string[];
  primaryTrigger: Story['interactions'][number]['triggers'][number];
  triggers: Story['interactions'][number]['triggers'];
}

export function getLinkedTriggerGroups(
  interaction: Story['interactions'][number],
): LinkedTriggerGroup[] {
  return interaction.triggers
    .filter((trigger) => trigger.inputInteractionIds.length > 0)
    .map((trigger) => ({
      inputInteractionIds: [...trigger.inputInteractionIds],
      primaryTrigger: trigger,
      triggers: [trigger],
    }));
}

function getTotalConditionCount(triggers: Story['interactions'][number]['triggers']) {
  return triggers.reduce((total, trigger) => total + getTriggerConditions(trigger).length, 0);
}

export function getTriggerNodeId(interactionId: string, triggerId: string) {
  return `trigger:${interactionId}:${triggerId}`;
}
