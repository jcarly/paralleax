import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import {
  getTriggerConditions,
  type Story,
  type StoryGraphTriggerPositionUpdate,
  type Trigger,
} from '@paralleax/shared';
import type { InteractionNodeData } from './components/InteractionNode';
import type { TriggerNodeData } from './components/TriggerNode';
import type { CommentPinFlowNode } from './features/comments/CommentPinNode';
import type { GraphDecorationFlowNode } from './features/graph-decorations/GraphDecorationNode';
import { getInteractionsNeedingChoiceLabel } from './features/story/choiceLabelDiagnostics';
import type { TriggerEdgeRoutePoint, TriggerEdgeRoutes } from './triggerEdgeRouting';

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
  elkRoute?: readonly TriggerEdgeRoutePoint[];
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
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
  onSelectRootTrigger?: (interactionId: string, triggerId: string) => void;
  onboardingBranchSourceId?: string;
  occurrenceCounts?: ReadonlyMap<string, number>;
  emphasizedInteractionIds?: ReadonlySet<string>;
  commentCounts?: ReadonlyMap<string, number>;
  onOpenComments?: (targetType: 'interaction' | 'trigger', targetId: string) => void;
}

export interface TriggerNodeActions {
  onSelectTrigger?: (interactionId: string, triggerId: string) => void;
  conditionSummary?: (triggers: readonly Trigger[]) => string;
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

type InteractionNodeContext = {
  needsChoiceLabel: ReadonlySet<string>;
  selectedId: string | undefined;
  selectedTrigger: SelectedTrigger | undefined;
  actions: InteractionNodeActions;
  locationsById: Map<string, NonNullable<Story['locations']>[number]>;
  charactersById: Map<string, NonNullable<Story['characters']>[number]>;
};

export type TriggerPositionUpdate = StoryGraphTriggerPositionUpdate;

export function buildInteractionNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  selectedTrigger?: SelectedTrigger,
  actions: InteractionNodeActions = {},
): InteractionFlowNode[] {
  if (!story) {
    return [];
  }
  const context = {
    needsChoiceLabel: getInteractionsNeedingChoiceLabel(story),
    selectedId,
    selectedTrigger,
    actions,
    locationsById: new Map((story.locations ?? []).map((location) => [location.id, location])),
    charactersById: new Map((story.characters ?? []).map((character) => [character.id, character])),
  };
  return story.interactions.map((item, index) => buildInteractionNode(item, index, context));
}

function buildInteractionNode(
  item: Story['interactions'][number],
  index: number,
  context: InteractionNodeContext,
): InteractionFlowNode {
  const rootTrigger = item.triggers.find((trigger) => trigger.inputInteractionIds.length === 0);
  const locationId = item.locationId;
  const location =
    typeof locationId === 'string' && locationId.length > 0
      ? context.locationsById.get(locationId)
      : undefined;
  const characters = (item.characterIds ?? []).flatMap((characterId) => {
    const character = context.charactersById.get(characterId);
    return character
      ? [
          {
            id: character.id,
            name: character.name,
            ...(character.imageUrl !== undefined && character.imageUrl.length > 0
              ? { imageUrl: character.imageUrl }
              : {}),
          },
        ]
      : [];
  });
  return {
    id: item.id,
    type: 'interaction',
    position: getInteractionPosition(item, index),
    data: buildInteractionNodeData(item, context, rootTrigger, { location, characters }),
  };
}

function buildInteractionNodeData(
  item: Story['interactions'][number],
  context: InteractionNodeContext,
  rootTrigger: Trigger | undefined,
  nodeData: {
    location: NonNullable<Story['locations']>[number] | undefined;
    characters: NonNullable<InteractionNodeData['characters']>;
  },
): InteractionNodeData {
  const { selectedId, selectedTrigger, actions } = context;
  const { location, characters } = nodeData;
  const statEffectCount = item.statEffects?.length ?? 0;
  const itemEffectCount = item.itemEffects?.length ?? 0;
  const occurrenceCount = actions.occurrenceCounts?.get(item.id) ?? 0;
  const commentCount = actions.commentCounts?.get(item.id) ?? 0;
  const rootTriggerCommentCount = rootTrigger
    ? (actions.commentCounts?.get(rootTrigger.id) ?? 0)
    : 0;
  return {
    title: item.title,
    body: item.body,
    ...(statEffectCount > 0 ? { statEffectCount } : {}),
    ...(itemEffectCount > 0 ? { itemEffectCount } : {}),
    selected: item.id === selectedId,
    ...(actions.onboardingBranchSourceId === item.id ? { onboardingBranchAdd: true } : {}),
    ...(location ? { location: { id: location.id, name: location.name } } : {}),
    ...(characters.length > 0 ? { characters } : {}),
    ...(occurrenceCount > 0 ? { occurrenceCount } : {}),
    ...(context.needsChoiceLabel.has(item.id) ? { needsChoiceLabel: true } : {}),
    ...(actions.emphasizedInteractionIds
      ? { dimmed: !actions.emphasizedInteractionIds.has(item.id) }
      : {}),
    ...(rootTrigger
      ? {
          rootTriggerId: rootTrigger.id,
          ...(rootTriggerCommentCount > 0 ? { rootTriggerCommentCount } : {}),
          rootTriggerSelected:
            selectedTrigger?.interactionId === item.id &&
            selectedTrigger.triggerId === rootTrigger.id,
        }
      : {}),
    ...(actions.onCreateChild ? { onCreateChild: actions.onCreateChild } : {}),
    ...(actions.onCreateParent ? { onCreateParent: actions.onCreateParent } : {}),
    ...(actions.onSelectRootTrigger ? { onSelectRootTrigger: actions.onSelectRootTrigger } : {}),
    ...(commentCount > 0 ? { commentCount } : {}),
    ...(actions.onOpenComments ? { onOpenComments: actions.onOpenComments } : {}),
  };
}

export function buildTriggerNodes(
  story: Story | undefined,
  selectedTrigger?: SelectedTrigger,
  actions: TriggerNodeActions = {},
): TriggerFlowNode[] {
  if (!story) {
    return [];
  }
  return story.interactions.flatMap((target, targetIndex) => {
    const context = { story, target, targetIndex, selectedTrigger, actions };
    return getLinkedTriggerGroups(target).map((group, triggerIndex) =>
      buildTriggerNode(context, group, triggerIndex),
    );
  });
}

function buildTriggerNode(
  context: {
    story: Story;
    target: Story['interactions'][number];
    targetIndex: number;
    selectedTrigger: SelectedTrigger | undefined;
    actions: TriggerNodeActions;
  },
  group: LinkedTriggerGroup,
  triggerIndex: number,
): TriggerFlowNode {
  const { story, target, targetIndex, selectedTrigger, actions } = context;
  return {
    id: getTriggerNodeId(target.id, group.primaryTrigger.id),
    type: 'trigger',
    position: getTriggerNodePosition(story, target, targetIndex, group, triggerIndex),
    draggable: true,
    selectable: true,
    data: buildTriggerNodeData(target.id, group, selectedTrigger, actions),
  };
}

function buildTriggerNodeData(
  targetId: string,
  group: LinkedTriggerGroup,
  selectedTrigger: SelectedTrigger | undefined,
  actions: TriggerNodeActions,
): TriggerNodeData {
  const triggerIds = group.triggers.map(({ id }) => id);
  const commentCount = triggerIds.reduce(
    (total, triggerId) => total + (actions.commentCounts?.get(triggerId) ?? 0),
    0,
  );
  const commentTargetId = triggerIds.find(
    (triggerId) => (actions.commentCounts?.get(triggerId) ?? 0) > 0,
  );
  return {
    interactionId: targetId,
    triggerId: group.primaryTrigger.id,
    triggerIds,
    selected:
      selectedTrigger?.interactionId === targetId &&
      Boolean(selectedTrigger.triggerId && triggerIds.includes(selectedTrigger.triggerId)),
    conditionCount: getTotalConditionCount(group.triggers),
    inputCount: group.inputInteractionIds.length,
    orGroupCount: group.triggers.length,
    ...(actions.conditionSummary
      ? { conditionSummary: actions.conditionSummary(group.triggers) }
      : {}),
    ...(commentCount > 0 ? { commentCount } : {}),
    ...(commentTargetId !== undefined ? { commentTargetId } : {}),
    ...(actions.onSelectTrigger ? { onSelectTrigger: actions.onSelectTrigger } : {}),
    ...(actions.onOpenComments ? { onOpenComments: actions.onOpenComments } : {}),
  };
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
  const previewPositions = getTriggerPreviewPositions(
    story,
    positionOverrides,
    directlyMovedTriggerNodeIds,
  );
  return applyTriggerPreviewPositions(nodes, previewPositions);
}

function getTriggerPreviewPositions(
  story: Story,
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
  directlyMovedTriggerNodeIds: ReadonlySet<string>,
) {
  const positions = new Map<string, { x: number; y: number }>();
  story.interactions.forEach((target, targetIndex) => {
    collectTargetTriggerPreviewPositions({
      story,
      target,
      targetIndex,
      positionOverrides,
      directlyMovedTriggerNodeIds,
      positions,
    });
  });
  return positions;
}

function collectTargetTriggerPreviewPositions(options: {
  story: Story;
  target: Story['interactions'][number];
  targetIndex: number;
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>;
  directlyMovedTriggerNodeIds: ReadonlySet<string>;
  positions: Map<string, { x: number; y: number }>;
}) {
  const { story, target, targetIndex, positionOverrides, directlyMovedTriggerNodeIds, positions } =
    options;
  if (!isTargetAffectedByMoves(target, positionOverrides)) {
    return;
  }
  getLinkedTriggerGroups(target).forEach((group, triggerIndex) => {
    if (!isTriggerGroupAffectedByMoves(target, group, positionOverrides)) {
      return;
    }
    const triggerNodeId = getTriggerNodeId(target.id, group.primaryTrigger.id);
    if (directlyMovedTriggerNodeIds.has(triggerNodeId)) {
      return;
    }
    positions.set(
      triggerNodeId,
      getTriggerNodePosition(story, target, targetIndex, group, triggerIndex, positionOverrides),
    );
  });
}

function isTargetAffectedByMoves(
  target: Story['interactions'][number],
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
) {
  return (
    positionOverrides.has(target.id) ||
    target.triggers.some((trigger) =>
      trigger.inputInteractionIds.some((inputId) => positionOverrides.has(inputId)),
    )
  );
}

function isTriggerGroupAffectedByMoves(
  target: Story['interactions'][number],
  group: LinkedTriggerGroup,
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
) {
  return (
    positionOverrides.has(target.id) ||
    group.inputInteractionIds.some((inputId) => positionOverrides.has(inputId))
  );
}

function applyTriggerPreviewPositions(
  nodes: StoryFlowNode[],
  previewPositions: ReadonlyMap<string, { x: number; y: number }>,
) {
  let changed = false;
  const nextNodes = nodes.map((node) => {
    const nextPosition = previewPositions.get(node.id);
    if (
      node.type !== 'trigger' ||
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
  const previewHandles = collectPreviewEdgeHandles(story, positionOverrides);
  return applyPreviewEdgeHandles(edges, previewHandles);
}

function collectPreviewEdgeHandles(
  story: Story,
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>,
) {
  const previewHandles = new Map<string, Pick<TriggerFlowEdge, 'sourceHandle' | 'targetHandle'>>();
  story.interactions.forEach((target, targetIndex) => {
    if (!isTargetAffectedByMoves(target, positionOverrides)) {
      return;
    }
    getLinkedTriggerGroups(target).forEach((group, triggerIndex) => {
      if (!isTriggerGroupAffectedByMoves(target, group, positionOverrides)) {
        return;
      }
      collectTriggerGroupPreviewHandles({
        story,
        target,
        targetIndex,
        group,
        triggerIndex,
        positionOverrides,
        previewHandles,
      });
    });
  });
  return previewHandles;
}

function collectTriggerGroupPreviewHandles(options: {
  story: Story;
  target: Story['interactions'][number];
  targetIndex: number;
  group: LinkedTriggerGroup;
  triggerIndex: number;
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>;
  previewHandles: Map<string, Pick<TriggerFlowEdge, 'sourceHandle' | 'targetHandle'>>;
}) {
  const { story, target, targetIndex, group, triggerIndex, positionOverrides, previewHandles } =
    options;
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
    setPreviewInputHandle({
      story,
      sourceId,
      triggerNodeId,
      triggerCenter,
      positionOverrides,
      previewHandles,
    });
  });
  const targetCenter = getInteractionCenter(target, targetIndex, positionOverrides.get(target.id));
  previewHandles.set(
    `${triggerNodeId}-output`,
    constrainInteractionInputHandle(getRoutingHandleIds(triggerCenter, targetCenter)),
  );
}

function setPreviewInputHandle(options: {
  story: Story;
  sourceId: string;
  triggerNodeId: string;
  triggerCenter: { x: number; y: number };
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>;
  previewHandles: Map<string, Pick<TriggerFlowEdge, 'sourceHandle' | 'targetHandle'>>;
}) {
  const { story, sourceId, triggerNodeId, triggerCenter, positionOverrides, previewHandles } =
    options;
  const sourceEntry = getIndexedStoryInteraction(story, sourceId);
  if (!sourceEntry) {
    return;
  }
  const sourceCenter = getInteractionCenter(
    sourceEntry.interaction,
    sourceEntry.index,
    positionOverrides.get(sourceId),
  );
  previewHandles.set(
    `${triggerNodeId}-${sourceId}`,
    constrainInteractionOutputHandle(getRoutingHandleIds(sourceCenter, triggerCenter)),
  );
}

function applyPreviewEdgeHandles(
  edges: TriggerFlowEdge[],
  previewHandles: ReadonlyMap<string, Pick<TriggerFlowEdge, 'sourceHandle' | 'targetHandle'>>,
) {
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
    collectTargetTriggerPositionUpdates({ story, target, targetIndex, positionOverrides, updates });
  });
  return updates;
}

function collectTargetTriggerPositionUpdates(options: {
  story: Story;
  target: Story['interactions'][number];
  targetIndex: number;
  positionOverrides: ReadonlyMap<string, { x: number; y: number }>;
  updates: TriggerPositionUpdate[];
}) {
  const { story, target, targetIndex, positionOverrides, updates } = options;
  if (!isTargetAffectedByMoves(target, positionOverrides)) {
    return;
  }
  getLinkedTriggerGroups(target).forEach((group, triggerIndex) => {
    if (!isTriggerGroupAffectedByMoves(target, group, positionOverrides)) {
      return;
    }
    const savedPosition = getSavedTriggerNodePosition(group);
    if (!savedPosition) {
      return;
    }
    const nextPosition = getTriggerNodePosition(
      story,
      target,
      targetIndex,
      group,
      triggerIndex,
      positionOverrides,
    );
    if (nextPosition.x === savedPosition.x && nextPosition.y === savedPosition.y) {
      return;
    }
    updates.push({
      interactionId: target.id,
      triggerIds: group.triggers.map(({ id }) => id),
      position: nextPosition,
    });
  });
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

interface TriggerEdgeBuildContext {
  onSelectTrigger?: (trigger: SelectedTrigger) => void;
  onDeleteTriggerInput?: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => void;
  edgeRoutes?: TriggerEdgeRoutes;
}

interface TriggerTargetEdgeOptions extends TriggerEdgeBuildContext {
  story: Story;
  target: Story['interactions'][number];
  targetIndex: number;
}

interface TriggerGroupEdgeOptions extends TriggerTargetEdgeOptions {
  group: LinkedTriggerGroup;
  triggerIndex: number;
}

export function buildTriggerEdges(
  story: Story | undefined,
  onSelectTrigger?: (trigger: SelectedTrigger) => void,
  onDeleteTriggerInput?: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => void,
  edgeRoutes?: TriggerEdgeRoutes,
): TriggerFlowEdge[] {
  const actions = { onSelectTrigger, onDeleteTriggerInput, edgeRoutes };
  const edges = story
    ? story.interactions.flatMap((target, targetIndex) =>
        buildTargetTriggerEdges({ story, target, targetIndex, ...actions }),
      )
    : [];
  return assignRoutingLanes(story, edges);
}

function buildTargetTriggerEdges(options: TriggerTargetEdgeOptions) {
  return getLinkedTriggerGroups(options.target).flatMap((group, triggerIndex) =>
    buildTriggerGroupEdges({ ...options, group, triggerIndex }),
  );
}

function buildTriggerGroupEdges(options: TriggerGroupEdgeOptions): TriggerFlowEdge[] {
  const { story, target, targetIndex, group, triggerIndex } = options;
  const triggerNodeId = getTriggerNodeId(target.id, group.primaryTrigger.id);
  const position = getTriggerNodePosition(story, target, targetIndex, group, triggerIndex);
  const triggerCenter = {
    x: position.x + triggerNodeSize / 2,
    y: position.y + triggerNodeSize / 2,
  };
  const triggerIds = group.triggers.map(({ id }) => id);
  const conditionCount = getTotalConditionCount(group.triggers);
  const inputEdges = group.inputInteractionIds.map((source) =>
    buildTriggerInputEdge({
      ...options,
      source,
      triggerNodeId,
      triggerCenter,
      triggerIds,
      conditionCount,
    }),
  );
  const outputEdge = buildTriggerOutputEdge({
    ...options,
    triggerNodeId,
    triggerCenter,
    triggerIds,
    conditionCount,
  });
  return [...inputEdges, outputEdge];
}

function buildTriggerInputEdge(
  options: TriggerGroupEdgeOptions & {
    source: string;
    triggerNodeId: string;
    triggerCenter: { x: number; y: number };
    triggerIds: string[];
    conditionCount: number;
  },
): TriggerFlowEdge {
  const {
    story,
    target,
    group,
    source,
    triggerNodeId,
    triggerCenter,
    triggerIds,
    conditionCount,
    edgeRoutes,
    onSelectTrigger,
    onDeleteTriggerInput,
  } = options;
  const edgeId = `${triggerNodeId}-${source}`;
  const sourceEntry = getIndexedStoryInteraction(story, source);
  const sourceCenter = sourceEntry
    ? getInteractionCenter(sourceEntry.interaction, sourceEntry.index)
    : triggerCenter;
  const handles = constrainInteractionOutputHandle(
    getRoutingHandleIds(sourceCenter, triggerCenter),
  );
  return {
    id: edgeId,
    type: 'trigger',
    source,
    sourceHandle: handles.sourceHandle,
    target: triggerNodeId,
    targetHandle: handles.targetHandle,
    markerStart: triggerOutputMarker,
    markerEnd: triggerOutputMarker,
    className: 'trigger-edge',
    data: {
      interactionId: target.id,
      triggerId: group.primaryTrigger.id,
      triggerIds,
      inputInteractionId: source,
      selected: false,
      conditionCount,
      ...(edgeRoutes?.get(edgeId) ? { elkRoute: edgeRoutes.get(edgeId) } : {}),
      ...(onSelectTrigger ? { onSelectTrigger } : {}),
      ...(onDeleteTriggerInput ? { onDeleteTriggerInput } : {}),
    },
  };
}

function buildTriggerOutputEdge(
  options: TriggerGroupEdgeOptions & {
    triggerNodeId: string;
    triggerCenter: { x: number; y: number };
    triggerIds: string[];
    conditionCount: number;
  },
): TriggerFlowEdge {
  const {
    target,
    targetIndex,
    group,
    triggerNodeId,
    triggerCenter,
    triggerIds,
    conditionCount,
    edgeRoutes,
    onSelectTrigger,
  } = options;
  const edgeId = `${triggerNodeId}-output`;
  const targetCenter = getInteractionCenter(target, targetIndex);
  const handles = constrainInteractionInputHandle(getRoutingHandleIds(triggerCenter, targetCenter));
  return {
    id: edgeId,
    type: 'trigger',
    source: triggerNodeId,
    sourceHandle: handles.sourceHandle,
    target: target.id,
    targetHandle: handles.targetHandle,
    markerStart: triggerOutputMarker,
    markerEnd: triggerOutputMarker,
    className: 'trigger-edge',
    data: {
      interactionId: target.id,
      triggerId: group.primaryTrigger.id,
      triggerIds,
      selected: false,
      conditionCount,
      ...(edgeRoutes?.get(edgeId) ? { elkRoute: edgeRoutes.get(edgeId) } : {}),
      ...(onSelectTrigger ? { onSelectTrigger } : {}),
    },
  };
}

function assignRoutingLanes(story: Story | undefined, edges: TriggerFlowEdge[]) {
  if (!story || edges.length < 2) {
    return edges;
  }
  const centers = getRoutingCenters(story);
  const groups = groupEdgesByRoutingLane(edges, centers);
  const lanes = getRoutingLaneAssignments(groups);
  return lanes.size === 0 ? edges : applyRoutingLaneAssignments(edges, lanes);
}

function getRoutingCenters(story: Story) {
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
  return centers;
}

type RoutingLaneEdge = {
  edge: TriggerFlowEdge;
  source: { x: number; y: number };
  target: { x: number; y: number };
};

function groupEdgesByRoutingLane(
  edges: TriggerFlowEdge[],
  centers: ReadonlyMap<string, { x: number; y: number }>,
) {
  const groups = new Map<string, RoutingLaneEdge[]>();
  for (const edge of edges) {
    const source = centers.get(edge.source);
    const target = centers.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const key = [
      Math.round(source.y / routingLaneBandSize),
      Math.round(target.y / routingLaneBandSize),
      edge.sourceHandle,
      edge.targetHandle,
    ].join(':');
    const group = groups.get(key);
    if (group) {
      group.push({ edge, source, target });
    } else {
      groups.set(key, [{ edge, source, target }]);
    }
  }
  return groups;
}

function getRoutingLaneAssignments(groups: ReadonlyMap<string, RoutingLaneEdge[]>) {
  const lanes = new Map<string, { index: number; count: number }>();
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    group.sort(
      (left, right) =>
        Math.min(left.source.x, left.target.x) - Math.min(right.source.x, right.target.x) ||
        Math.max(left.source.x, left.target.x) - Math.max(right.source.x, right.target.x) ||
        left.edge.id.localeCompare(right.edge.id),
    );
    group.forEach(({ edge }, index) => lanes.set(edge.id, { index, count: group.length }));
  }
  return lanes;
}

function applyRoutingLaneAssignments(
  edges: TriggerFlowEdge[],
  lanes: ReadonlyMap<string, { index: number; count: number }>,
) {
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
    if (savedPosition) {
      return savedPosition;
    }
  }

  const automaticPosition = getAutomaticTriggerNodePosition(
    story,
    target,
    targetIndex,
    group,
    triggerIndex,
    interactionPositionOverrides,
  );
  if (!savedPosition) {
    return automaticPosition;
  }

  const originalAutomaticPosition = getAutomaticTriggerNodePosition(
    story,
    target,
    targetIndex,
    group,
    triggerIndex,
  );
  return followSavedTriggerPosition(savedPosition, automaticPosition, originalAutomaticPosition);
}

function followSavedTriggerPosition(
  savedPosition: { x: number; y: number },
  automaticPosition: { x: number; y: number },
  originalAutomaticPosition: { x: number; y: number },
) {
  const automaticDelta = {
    x: automaticPosition.x - originalAutomaticPosition.x,
    y: automaticPosition.y - originalAutomaticPosition.y,
  };
  if (automaticDelta.x === 0 && automaticDelta.y === 0) {
    return savedPosition;
  }

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
): ReturnType<typeof getRoutingHandleIds> {
  return {
    ...handles,
    sourceHandle: `routing-output-${Position.Bottom}`,
  };
}

function constrainInteractionInputHandle(
  handles: ReturnType<typeof getRoutingHandleIds>,
): ReturnType<typeof getRoutingHandleIds> {
  return {
    ...handles,
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
