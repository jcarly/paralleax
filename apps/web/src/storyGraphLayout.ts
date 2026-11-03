import type { Position, Story, StoryGraphInteractionPositionUpdate } from '@paralleax/shared';
import {
  getInteractionMovesTriggerPositionUpdates,
  getLinkedTriggerGroups,
  getTriggerNodeId,
  getTriggerNodePosition,
  interactionNodeHeight,
  interactionNodeWidth,
  type TriggerPositionUpdate,
} from './storyGraph';
import type { TriggerEdgeRoutes } from './triggerEdgeRouting';

export type StoryGraphLayoutTarget =
  | { type: 'interaction'; interactionId: string }
  | { type: 'trigger'; interactionId: string; triggerId: string };

export type StoryGraphLayoutScope =
  { kind: 'all' } | { kind: 'selection'; targets: readonly StoryGraphLayoutTarget[] };

export type InteractionPositionUpdate = StoryGraphInteractionPositionUpdate;

export interface StoryGraphLayoutResult {
  interactionUpdates: InteractionPositionUpdate[];
  triggerUpdates: TriggerPositionUpdate[];
  affectedNodeIds: string[];
  edgeRoutes?: TriggerEdgeRoutes;
}

export interface StoryGraphLayoutOptions {
  interactionSizes?: ReadonlyMap<string, { width: number; height: number }>;
}

interface LayoutVertex {
  key: string;
  nodeId: string;
  kind: 'interaction' | 'trigger';
  width: number;
  height: number;
  layoutWidth: number;
  currentPosition: Position;
  order: number;
  interactionId: string;
  triggerIds?: string[];
}

interface Projection {
  vertices: LayoutVertex[];
  byKey: Map<string, LayoutVertex>;
  incoming: Map<string, Set<string>>;
  outgoing: Map<string, Set<string>>;
}

const triggerNodeSize = 20;
const triggerLayoutWidth = 80;
const horizontalGap = 140;
const verticalGap = 120;
const componentGap = 260;
const defaultOrigin = { x: 80, y: 120 };

export function computeLegacyStoryGraphLayout(
  story: Story,
  scope: StoryGraphLayoutScope,
  options: StoryGraphLayoutOptions = {},
): StoryGraphLayoutResult {
  const projection = buildProjection(story, options);
  if (projection.vertices.length === 0) {
    return { interactionUpdates: [], triggerUpdates: [], affectedNodeIds: [] };
  }

  const canonicalPositions = layoutProjection(projection);
  return projectStoryGraphLayoutScopeFromProjection(story, projection, scope, canonicalPositions);
}

/**
 * Limits full-graph coordinates to an editor scope without moving its fixed
 * neighbors. Both layout engines use this projection so selection semantics stay
 * independent from the algorithm that supplied the coordinates.
 */
export function projectStoryGraphLayoutScope(
  story: Story,
  scope: StoryGraphLayoutScope,
  canonicalPositions: ReadonlyMap<string, Position>,
  options: StoryGraphLayoutOptions = {},
): StoryGraphLayoutResult {
  const projection = buildProjection(story, options);
  return projectStoryGraphLayoutScopeFromProjection(story, projection, scope, canonicalPositions);
}

function projectStoryGraphLayoutScopeFromProjection(
  story: Story,
  projection: Projection,
  scope: StoryGraphLayoutScope,
  canonicalPositions: ReadonlyMap<string, Position>,
): StoryGraphLayoutResult {
  if (projection.vertices.length === 0) {
    return emptyLayoutResult();
  }
  const selectedKeys = getSelectedKeys(projection, scope);
  if (
    selectedKeys.size === 0 ||
    hasMissingCanonicalPosition(projection, scope, canonicalPositions)
  ) {
    return emptyLayoutResult();
  }
  const positions = getScopedLayoutPositions(projection, scope, canonicalPositions, selectedKeys);
  const interactionUpdates = getInteractionPositionUpdates(projection, positions, selectedKeys);
  return {
    interactionUpdates,
    triggerUpdates: getTriggerPositionUpdates({
      story,
      projection,
      scope,
      positions,
      selectedKeys,
      interactionUpdates,
    }),
    affectedNodeIds: getAffectedNodeIds(projection, selectedKeys),
  };
}

function emptyLayoutResult(): StoryGraphLayoutResult {
  return { interactionUpdates: [], triggerUpdates: [], affectedNodeIds: [] };
}

function hasMissingCanonicalPosition(
  projection: Projection,
  scope: StoryGraphLayoutScope,
  canonicalPositions: ReadonlyMap<string, Position>,
): boolean {
  return (
    scope.kind === 'selection' &&
    projection.vertices.some((vertex) => !canonicalPositions.has(vertex.key))
  );
}

function getScopedLayoutPositions(
  projection: Projection,
  scope: StoryGraphLayoutScope,
  canonicalPositions: ReadonlyMap<string, Position>,
  selectedKeys: Set<string>,
): ReadonlyMap<string, Position> {
  return scope.kind === 'all'
    ? canonicalPositions
    : alignSelectionToFixedGraph(projection, canonicalPositions, selectedKeys);
}

function getInteractionPositionUpdates(
  projection: Projection,
  positions: ReadonlyMap<string, Position>,
  selectedKeys: Set<string>,
): InteractionPositionUpdate[] {
  return projection.vertices.flatMap((vertex) => {
    if (vertex.kind !== 'interaction' || !selectedKeys.has(vertex.key)) {
      return [];
    }
    const position = positions.get(vertex.key);
    if (!position || positionsEqual(position, vertex.currentPosition)) {
      return [];
    }
    return [{ interactionId: vertex.interactionId, position }];
  });
}

function getTriggerPositionUpdates(input: {
  story: Story;
  projection: Projection;
  scope: StoryGraphLayoutScope;
  positions: ReadonlyMap<string, Position>;
  selectedKeys: Set<string>;
  interactionUpdates: InteractionPositionUpdate[];
}): TriggerPositionUpdate[] {
  const updatesByGroup = new Map<string, TriggerPositionUpdate>();
  const interactionOverrides = new Map(
    input.interactionUpdates.map(({ interactionId, position }) => [interactionId, position]),
  );
  if (input.scope.kind === 'selection') {
    for (const update of getInteractionMovesTriggerPositionUpdates(
      input.story,
      interactionOverrides,
    )) {
      updatesByGroup.set(getTriggerUpdateKey(update), update);
    }
  }
  for (const vertex of input.projection.vertices) {
    if (!isSelectedTriggerVertex(vertex, input.selectedKeys)) {
      continue;
    }
    const position = input.positions.get(vertex.key);
    if (!position || !shouldUpdateTriggerPosition(input.story, vertex, position)) {
      continue;
    }
    const update = {
      interactionId: vertex.interactionId,
      triggerIds: vertex.triggerIds,
      position,
    };
    updatesByGroup.set(getTriggerUpdateKey(update), update);
  }
  return [...updatesByGroup.values()];
}

function isSelectedTriggerVertex(
  vertex: LayoutVertex,
  selectedKeys: Set<string>,
): vertex is LayoutVertex & { kind: 'trigger'; triggerIds: string[] } {
  return (
    vertex.kind === 'trigger' && selectedKeys.has(vertex.key) && vertex.triggerIds !== undefined
  );
}

function shouldUpdateTriggerPosition(
  story: Story,
  vertex: LayoutVertex & { kind: 'trigger'; triggerIds: string[] },
  position: Position,
): boolean {
  const owner = story.interactions.find(({ id }) => id === vertex.interactionId);
  return (
    vertex.triggerIds.some((triggerId) => {
      const saved = owner?.triggers.find(({ id }) => id === triggerId)?.position;
      return !saved || !positionsEqual(saved, position);
    }) ?? false
  );
}

function getAffectedNodeIds(projection: Projection, selectedKeys: Set<string>): string[] {
  return projection.vertices
    .filter((vertex) => selectedKeys.has(vertex.key))
    .map((vertex) => vertex.nodeId);
}

function buildProjection(story: Story, options: StoryGraphLayoutOptions): Projection {
  const vertices: LayoutVertex[] = story.interactions.map((interaction, index) => {
    const size = getInteractionSize(interaction.id, options.interactionSizes);
    return {
      key: getInteractionKey(interaction.id),
      nodeId: interaction.id,
      kind: 'interaction',
      width: size.width,
      height: size.height,
      layoutWidth: size.width,
      currentPosition: interaction.position,
      order: index * 10_000,
      interactionId: interaction.id,
    };
  });
  const knownInteractionIds = new Set(story.interactions.map(({ id }) => id));
  const incoming = new Map(vertices.map(({ key }) => [key, new Set<string>()]));
  const outgoing = new Map(vertices.map(({ key }) => [key, new Set<string>()]));
  addTriggerVertices(story, knownInteractionIds, { vertices, incoming, outgoing });
  return {
    vertices,
    byKey: new Map(vertices.map((vertex) => [vertex.key, vertex])),
    incoming,
    outgoing,
  };
}

interface ProjectionBuilderState {
  vertices: LayoutVertex[];
  incoming: Map<string, Set<string>>;
  outgoing: Map<string, Set<string>>;
}

function addTriggerVertices(
  story: Story,
  knownInteractionIds: Set<string>,
  state: ProjectionBuilderState,
): void {
  story.interactions.forEach((target, targetIndex) => {
    getLinkedTriggerGroups(target).forEach((group, groupIndex) => {
      const key = getTriggerKey(target.id, group.primaryTrigger.id);
      const triggerVertex: LayoutVertex = {
        key,
        nodeId: getTriggerNodeId(target.id, group.primaryTrigger.id),
        kind: 'trigger',
        width: triggerNodeSize,
        height: triggerNodeSize,
        layoutWidth: triggerLayoutWidth,
        currentPosition: getTriggerNodePosition(story, target, targetIndex, group, groupIndex),
        order: targetIndex * 10_000 + groupIndex + 1,
        interactionId: target.id,
        triggerIds: group.triggers.map(({ id }) => id),
      };
      state.vertices.push(triggerVertex);
      state.incoming.set(key, new Set());
      state.outgoing.set(key, new Set());

      for (const inputId of group.inputInteractionIds) {
        if (!knownInteractionIds.has(inputId)) {
          continue;
        }
        addEdge(getInteractionKey(inputId), key, state.incoming, state.outgoing);
      }
      addEdge(key, getInteractionKey(target.id), state.incoming, state.outgoing);
    });
  });
}

function addEdge(
  source: string,
  target: string,
  incoming: Map<string, Set<string>>,
  outgoing: Map<string, Set<string>>,
) {
  outgoing.get(source)?.add(target);
  incoming.get(target)?.add(source);
}

function layoutProjection(projection: Projection): Map<string, Position> {
  const components = getWeakComponents(projection).sort((left, right) => {
    const leftX = Math.min(
      ...left.map((key) => requireDefined(projection.byKey.get(key)).currentPosition.x),
    );
    const rightX = Math.min(
      ...right.map((key) => requireDefined(projection.byKey.get(key)).currentPosition.x),
    );
    return leftX - rightX || getMinimumOrder(left, projection) - getMinimumOrder(right, projection);
  });
  const interactionVertices = projection.vertices.filter(({ kind }) => kind === 'interaction');
  const origin = interactionVertices.length
    ? {
        x: Math.round(
          Math.min(...interactionVertices.map(({ currentPosition }) => currentPosition.x)),
        ),
        y: Math.round(
          Math.min(...interactionVertices.map(({ currentPosition }) => currentPosition.y)),
        ),
      }
    : defaultOrigin;
  const positions = new Map<string, Position>();
  let componentX = origin.x;

  for (const component of components) {
    const laidOut = layoutComponent(component, projection);
    for (const [key, position] of laidOut.positions) {
      positions.set(key, {
        x: Math.round(componentX + position.x),
        y: Math.round(origin.y + position.y),
      });
    }
    componentX += laidOut.width + componentGap;
  }

  return positions;
}

function getWeakComponents(projection: Projection): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const vertex of [...projection.vertices].sort(compareVertexOrder)) {
    if (visited.has(vertex.key)) {
      continue;
    }
    components.push(getWeakComponent(vertex.key, projection, visited));
  }
  return components;
}

function getWeakComponent(start: string, projection: Projection, visited: Set<string>): string[] {
  const component: string[] = [];
  const pending = [start];
  visited.add(start);
  while (pending.length > 0) {
    const key = requireDefined(pending.shift());
    component.push(key);
    addUnvisitedNeighbors(getOrderedNeighbors(key, projection), pending, visited);
  }
  return component;
}

function getOrderedNeighbors(key: string, projection: Projection): string[] {
  const neighbors = new Set([
    ...(projection.incoming.get(key) ?? []),
    ...(projection.outgoing.get(key) ?? []),
  ]);
  return [...neighbors].sort((left, right) =>
    compareVertexOrder(
      requireDefined(projection.byKey.get(left)),
      requireDefined(projection.byKey.get(right)),
    ),
  );
}

function addUnvisitedNeighbors(neighbors: string[], pending: string[], visited: Set<string>): void {
  for (const neighbor of neighbors) {
    if (visited.has(neighbor)) {
      continue;
    }
    visited.add(neighbor);
    pending.push(neighbor);
  }
}

function layoutComponent(
  component: string[],
  projection: Projection,
): { positions: Map<string, Position>; width: number } {
  const ranks = getRanks(component, projection);
  const layers = createLayers(component, ranks);
  sortLayersByCurrentPosition(layers, projection);
  reduceCrossings(layers, projection);
  const measures = measureLayoutLayers(layers, projection);
  const positions = placeLayoutLayers(layers, projection, measures);
  alignLayersToSuccessors(layers, projection, positions, measures.width);
  return { positions, width: measures.width };
}

interface LayoutLayerMeasures {
  widths: Map<number, number>;
  heights: Map<number, number>;
  width: number;
  maximumRank: number;
}

function createLayers(component: string[], ranks: Map<string, number>): Map<number, string[]> {
  const layers = new Map<number, string[]>();
  for (const key of component) {
    const rank = ranks.get(key) ?? 0;
    layers.set(rank, [...(layers.get(rank) ?? []), key]);
  }
  return layers;
}

function sortLayersByCurrentPosition(layers: Map<number, string[]>, projection: Projection): void {
  for (const layer of layers.values()) {
    layer.sort((left, right) => {
      const leftVertex = requireDefined(projection.byKey.get(left));
      const rightVertex = requireDefined(projection.byKey.get(right));
      return (
        leftVertex.currentPosition.x - rightVertex.currentPosition.x ||
        compareVertexOrder(leftVertex, rightVertex)
      );
    });
  }
}

function measureLayoutLayers(
  layers: Map<number, string[]>,
  projection: Projection,
): LayoutLayerMeasures {
  const widths = new Map<number, number>();
  const heights = new Map<number, number>();
  for (const [rank, layer] of layers) {
    widths.set(
      rank,
      layer.reduce(
        (total, key) => total + requireDefined(projection.byKey.get(key)).layoutWidth,
        0,
      ) +
        Math.max(0, layer.length - 1) * horizontalGap,
    );
    heights.set(
      rank,
      Math.max(...layer.map((key) => requireDefined(projection.byKey.get(key)).height)),
    );
  }
  return {
    widths,
    heights,
    width: Math.max(...widths.values(), interactionNodeWidth),
    maximumRank: Math.max(...layers.keys()),
  };
}

function placeLayoutLayers(
  layers: Map<number, string[]>,
  projection: Projection,
  measures: LayoutLayerMeasures,
): Map<string, Position> {
  const positions = new Map<string, Position>();
  let y = 0;
  for (let rank = 0; rank <= measures.maximumRank; rank += 1) {
    const layer = layers.get(rank);
    if (!layer) {
      y += triggerNodeSize + verticalGap;
      continue;
    }
    y = placeLayoutLayer({ layer, rank, projection, positions, measures, y });
  }
  return positions;
}

function placeLayoutLayer(input: {
  layer: string[];
  rank: number;
  projection: Projection;
  positions: Map<string, Position>;
  measures: LayoutLayerMeasures;
  y: number;
}): number {
  const layerWidth = requireDefined(input.measures.widths.get(input.rank));
  const layerHeight = requireDefined(input.measures.heights.get(input.rank));
  let x = (input.measures.width - layerWidth) / 2;
  for (const key of input.layer) {
    const vertex = requireDefined(input.projection.byKey.get(key));
    input.positions.set(key, {
      x: x + (vertex.layoutWidth - vertex.width) / 2,
      y: input.y + (layerHeight - vertex.height) / 2,
    });
    x += vertex.layoutWidth + horizontalGap;
  }
  return input.y + layerHeight + verticalGap;
}

function alignLayersToSuccessors(
  layers: Map<number, string[]>,
  projection: Projection,
  positions: Map<string, Position>,
  width: number,
) {
  const ranks = [...layers.keys()].sort((left, right) => right - left);

  for (let pass = 0; pass < 4; pass += 1) {
    for (const rank of ranks) {
      const layer = layers.get(rank);
      if (!layer || layer.length === 0) {
        continue;
      }
      alignLayerToSuccessors(layer, projection, positions, width);
    }
  }
}

function alignLayerToSuccessors(
  layer: string[],
  projection: Projection,
  positions: Map<string, Position>,
  width: number,
) {
  const vertices = layer.map((key) => requireDefined(projection.byKey.get(key)));
  const centers = vertices.map((vertex) => getSuccessorTargetCenter(vertex, projection, positions));
  enforceMinimumCenterGaps(centers, vertices);
  fitCentersToLayerWidth(centers, vertices, width);
  applyLayerCenters(vertices, centers, positions);
}

function getSuccessorTargetCenter(
  vertex: LayoutVertex,
  projection: Projection,
  positions: Map<string, Position>,
): number {
  const currentCenter = getVertexCenter(vertex, requireDefined(positions.get(vertex.key)));
  const successorCenters = [...(projection.outgoing.get(vertex.key) ?? [])]
    .flatMap((key) => {
      const successor = projection.byKey.get(key);
      const position = positions.get(key);
      return successor && position ? [getVertexCenter(successor, position)] : [];
    })
    .sort((left, right) => left - right);
  return successorCenters.length > 0 ? getMedian(successorCenters) : currentCenter;
}

function enforceMinimumCenterGaps(centers: number[], vertices: LayoutVertex[]): void {
  for (let index = 1; index < centers.length; index += 1) {
    centers[index] = Math.max(
      centers[index],
      centers[index - 1] + getMinimumCenterGap(vertices[index - 1], vertices[index]),
    );
  }
}

function fitCentersToLayerWidth(centers: number[], vertices: LayoutVertex[], width: number): void {
  const rightLimit = width - requireDefined(vertices.at(-1)).layoutWidth / 2;
  const overflow = requireDefined(centers.at(-1)) - rightLimit;
  if (overflow > 0) {
    shiftCenters(centers, -overflow);
  }

  for (let index = centers.length - 2; index >= 0; index -= 1) {
    centers[index] = Math.min(
      centers[index],
      centers[index + 1] - getMinimumCenterGap(vertices[index], vertices[index + 1]),
    );
  }

  const leftLimit = vertices[0].layoutWidth / 2;
  const underflow = leftLimit - centers[0];
  if (underflow > 0) {
    shiftCenters(centers, underflow);
  }
}

function shiftCenters(centers: number[], offset: number): void {
  centers.forEach((center, index) => {
    centers[index] = center + offset;
  });
}

function applyLayerCenters(
  vertices: LayoutVertex[],
  centers: number[],
  positions: Map<string, Position>,
): void {
  vertices.forEach((vertex, index) => {
    const position = requireDefined(positions.get(vertex.key));
    positions.set(vertex.key, { ...position, x: centers[index] - vertex.width / 2 });
  });
}

function getMinimumCenterGap(left: LayoutVertex, right: LayoutVertex) {
  return (left.layoutWidth + right.layoutWidth) / 2 + horizontalGap;
}

function getVertexCenter(vertex: LayoutVertex, position: Position) {
  return position.x + vertex.width / 2;
}

function getMedian(values: number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function getRanks(component: string[], projection: Projection): Map<string, number> {
  const strongComponents = getStrongComponents(component, projection);
  const componentByVertex = getComponentMembership(strongComponents);
  const graph = buildCondensedComponentGraph(
    component,
    projection,
    componentByVertex,
    strongComponents.length,
  );
  const order = orderCondensedComponents(strongComponents, graph, projection);
  return assignComponentRanks(strongComponents, order, projection);
}

interface CondensedComponentGraph {
  predecessors: Set<number>[];
  successors: Set<number>[];
}

interface CondensedComponentOrder {
  indices: number[];
  bases: number[];
}

function getComponentMembership(strongComponents: string[][]): Map<string, number> {
  const componentByVertex = new Map<string, number>();
  strongComponents.forEach((members, index) => {
    members.forEach((key) => componentByVertex.set(key, index));
  });
  return componentByVertex;
}

function buildCondensedComponentGraph(
  component: string[],
  projection: Projection,
  componentByVertex: Map<string, number>,
  componentCount: number,
): CondensedComponentGraph {
  const predecessors = Array.from({ length: componentCount }, () => new Set<number>());
  const successors = Array.from({ length: componentCount }, () => new Set<number>());
  for (const source of component) {
    for (const target of projection.outgoing.get(source) ?? []) {
      const sourceComponent = requireDefined(componentByVertex.get(source));
      const targetComponent = requireDefined(componentByVertex.get(target));
      if (sourceComponent === targetComponent) {
        continue;
      }
      successors[sourceComponent].add(targetComponent);
      predecessors[targetComponent].add(sourceComponent);
    }
  }
  return { predecessors, successors };
}

function orderCondensedComponents(
  strongComponents: string[][],
  graph: CondensedComponentGraph,
  projection: Projection,
): CondensedComponentOrder {
  const componentOrder = strongComponents.map((members) => getMinimumOrder(members, projection));
  const indegrees = graph.predecessors.map((items) => items.size);
  const pending = indegrees
    .map((indegree, index) => ({ indegree, index }))
    .filter(({ indegree }) => indegree === 0)
    .map(({ index }) => index)
    .sort((left, right) => componentOrder[left] - componentOrder[right]);
  const bases = strongComponents.map(() => 0);
  const indices: number[] = [];
  while (pending.length > 0) {
    const componentIndex = requireDefined(pending.shift());
    indices.push(componentIndex);
    for (const successor of graph.successors[componentIndex]) {
      updateComponentBase(successor, componentIndex, bases, strongComponents);
      indegrees[successor] -= 1;
      if (indegrees[successor] === 0) {
        insertComponentInOrder(pending, successor, componentOrder);
      }
    }
  }
  return { indices, bases };
}

function updateComponentBase(
  successor: number,
  source: number,
  bases: number[],
  strongComponents: string[][],
): void {
  bases[successor] = Math.max(bases[successor], bases[source] + strongComponents[source].length);
}

function insertComponentInOrder(pending: number[], componentIndex: number, order: number[]): void {
  pending.push(componentIndex);
  pending.sort((left, right) => order[left] - order[right]);
}

function assignComponentRanks(
  strongComponents: string[][],
  order: CondensedComponentOrder,
  projection: Projection,
): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const componentIndex of order.indices) {
    const members = [...strongComponents[componentIndex]].sort((left, right) => {
      const leftVertex = requireDefined(projection.byKey.get(left));
      const rightVertex = requireDefined(projection.byKey.get(right));
      return (
        leftVertex.currentPosition.y - rightVertex.currentPosition.y ||
        leftVertex.currentPosition.x - rightVertex.currentPosition.x ||
        compareVertexOrder(leftVertex, rightVertex)
      );
    });
    members.forEach((key, memberIndex) =>
      ranks.set(key, order.bases[componentIndex] + memberIndex),
    );
  }
  return ranks;
}

interface StrongComponentFrame {
  key: string;
  parent?: string;
  targets: string[];
  nextTargetIndex: number;
}

interface StrongComponentSearchState {
  projection: Projection;
  allowed: Set<string>;
  indices: Map<string, number>;
  lowLinks: Map<string, number>;
  componentStack: string[];
  onStack: Set<string>;
  traversalStack: StrongComponentFrame[];
  result: string[][];
  nextIndex: number;
}

function getStrongComponents(component: string[], projection: Projection): string[][] {
  const state = createStrongComponentSearchState(component, projection);
  for (const key of getOrderedComponentKeys(component, projection)) {
    if (!state.indices.has(key)) {
      visitStrongComponentRoot(key, state);
    }
  }
  return state.result;
}

function createStrongComponentSearchState(
  component: string[],
  projection: Projection,
): StrongComponentSearchState {
  return {
    projection,
    allowed: new Set(component),
    indices: new Map(),
    lowLinks: new Map(),
    componentStack: [],
    onStack: new Set(),
    traversalStack: [],
    result: [],
    nextIndex: 0,
  };
}

function getOrderedComponentKeys(component: string[], projection: Projection): string[] {
  return [...component].sort((left, right) =>
    compareVertexOrder(
      requireDefined(projection.byKey.get(left)),
      requireDefined(projection.byKey.get(right)),
    ),
  );
}

function visitStrongComponentRoot(key: string, state: StrongComponentSearchState): void {
  openStrongComponentVertex(key, state);
  state.traversalStack.push(createStrongComponentFrame(key, state));
  while (state.traversalStack.length > 0) {
    advanceStrongComponentTraversal(state);
  }
}

function openStrongComponentVertex(key: string, state: StrongComponentSearchState): void {
  state.indices.set(key, state.nextIndex);
  state.lowLinks.set(key, state.nextIndex);
  state.nextIndex += 1;
  state.componentStack.push(key);
  state.onStack.add(key);
}

function createStrongComponentFrame(
  key: string,
  state: StrongComponentSearchState,
): StrongComponentFrame {
  return { key, targets: getStrongComponentTargets(key, state), nextTargetIndex: 0 };
}

function getStrongComponentTargets(key: string, state: StrongComponentSearchState): string[] {
  return [...(state.projection.outgoing.get(key) ?? [])]
    .filter((target) => state.allowed.has(target))
    .sort((left, right) =>
      compareVertexOrder(
        requireDefined(state.projection.byKey.get(left)),
        requireDefined(state.projection.byKey.get(right)),
      ),
    );
}

function advanceStrongComponentTraversal(state: StrongComponentSearchState): void {
  const frame = requireDefined(state.traversalStack.at(-1));
  const target = frame.targets[frame.nextTargetIndex];
  if (target !== undefined) {
    visitStrongComponentTarget(frame, target, state);
    return;
  }
  finishStrongComponentFrame(frame, state);
}

function visitStrongComponentTarget(
  frame: StrongComponentFrame,
  target: string,
  state: StrongComponentSearchState,
): void {
  frame.nextTargetIndex += 1;
  if (!state.indices.has(target)) {
    openStrongComponentVertex(target, state);
    state.traversalStack.push({
      ...createStrongComponentFrame(target, state),
      parent: frame.key,
    });
    return;
  }
  if (state.onStack.has(target)) {
    updateLowLinkFromIndex(frame.key, target, state);
  }
}

function finishStrongComponentFrame(
  frame: StrongComponentFrame,
  state: StrongComponentSearchState,
): void {
  state.traversalStack.pop();
  if (frame.parent !== undefined) {
    updateLowLinkFromChild(frame.parent, frame.key, state);
  }
  if (state.lowLinks.get(frame.key) !== state.indices.get(frame.key)) {
    return;
  }
  state.result.push(collectStrongComponent(frame.key, state));
}

function updateLowLinkFromIndex(
  source: string,
  target: string,
  state: StrongComponentSearchState,
): void {
  state.lowLinks.set(
    source,
    Math.min(requireDefined(state.lowLinks.get(source)), requireDefined(state.indices.get(target))),
  );
}

function updateLowLinkFromChild(
  source: string,
  child: string,
  state: StrongComponentSearchState,
): void {
  state.lowLinks.set(
    source,
    Math.min(requireDefined(state.lowLinks.get(source)), requireDefined(state.lowLinks.get(child))),
  );
}

function collectStrongComponent(root: string, state: StrongComponentSearchState): string[] {
  const members: string[] = [];
  let member: string;
  do {
    member = requireDefined(state.componentStack.pop());
    state.onStack.delete(member);
    members.push(member);
  } while (member !== root);
  return members;
}

function reduceCrossings(layers: Map<number, string[]>, projection: Projection) {
  const ranks = [...layers.keys()].sort((left, right) => left - right);
  let bestLayers = copyLayerOrder(layers);
  let bestCrossingCount = countLayerCrossings(layers, projection);
  let bestEdgeSpan = getLayerEdgeSpan(layers, projection);
  const keepBestOrder = () => {
    const crossingCount = countLayerCrossings(layers, projection);
    const edgeSpan = getLayerEdgeSpan(layers, projection);
    if (
      crossingCount > bestCrossingCount ||
      (crossingCount === bestCrossingCount && edgeSpan >= bestEdgeSpan)
    ) {
      return;
    }
    bestCrossingCount = crossingCount;
    bestEdgeSpan = edgeSpan;
    bestLayers = copyLayerOrder(layers);
  };
  for (let pass = 0; pass < 4; pass += 1) {
    for (const rank of ranks) {
      sortLayer(layers, rank, projection.incoming);
    }
    keepBestOrder();
    for (const rank of [...ranks].reverse()) {
      sortLayer(layers, rank, projection.outgoing);
    }
    keepBestOrder();
  }
  for (const [rank, layer] of bestLayers) {
    layers.set(rank, layer);
  }
  optimizeAdjacentLayerSwaps(layers, projection);
}

function optimizeAdjacentLayerSwaps(layers: Map<number, string[]>, projection: Projection) {
  const state: LayerSwapState = {
    layers,
    projection,
    crossingCount: countLayerCrossings(layers, projection),
    edgeSpan: getLayerEdgeSpan(layers, projection),
    improved: false,
  };
  const ranks = [...layers.keys()].sort((left, right) => left - right);
  for (let pass = 0; pass < 4; pass += 1) {
    state.improved = false;
    for (const rank of ranks) {
      const layer = layers.get(rank);
      if (layer && layer.length >= 2) {
        optimizeLayerSwaps(layer, state);
      }
    }
    if (!state.improved) {
      return;
    }
  }
}

interface LayerSwapState {
  layers: Map<number, string[]>;
  projection: Projection;
  crossingCount: number;
  edgeSpan: number;
  improved: boolean;
}

function optimizeLayerSwaps(layer: string[], state: LayerSwapState): void {
  for (let index = 0; index < layer.length - 1; index += 1) {
    considerAdjacentLayerSwap(layer, index, state);
  }
}

function considerAdjacentLayerSwap(layer: string[], index: number, state: LayerSwapState): void {
  swapAdjacentKeys(layer, index);
  const candidateCrossingCount = countLayerCrossings(state.layers, state.projection);
  const candidateEdgeSpan = getLayerEdgeSpan(state.layers, state.projection);
  if (isBetterLayerOrder(candidateCrossingCount, candidateEdgeSpan, state)) {
    state.crossingCount = candidateCrossingCount;
    state.edgeSpan = candidateEdgeSpan;
    state.improved = true;
    return;
  }
  swapAdjacentKeys(layer, index);
}

function swapAdjacentKeys(layer: string[], index: number): void {
  [layer[index], layer[index + 1]] = [layer[index + 1], layer[index]];
}

function isBetterLayerOrder(
  crossingCount: number,
  edgeSpan: number,
  state: LayerSwapState,
): boolean {
  return (
    crossingCount < state.crossingCount ||
    (crossingCount === state.crossingCount && edgeSpan < state.edgeSpan)
  );
}

function copyLayerOrder(layers: Map<number, string[]>) {
  return new Map([...layers].map(([rank, layer]) => [rank, [...layer]]));
}

function getLayerEdgeSpan(layers: Map<number, string[]>, projection: Projection) {
  const normalizedOrder = new Map<string, number>();
  for (const layer of layers.values()) {
    layer.forEach((key, index) => normalizedOrder.set(key, (index + 0.5) / layer.length));
  }
  let span = 0;
  for (const [source, targets] of projection.outgoing) {
    const sourceOrder = normalizedOrder.get(source);
    if (sourceOrder === undefined) {
      continue;
    }
    for (const target of targets) {
      const targetOrder = normalizedOrder.get(target);
      if (targetOrder !== undefined) {
        span += Math.abs(sourceOrder - targetOrder);
      }
    }
  }
  return span;
}

function countLayerCrossings(layers: Map<number, string[]>, projection: Projection) {
  const orderIndexes = getLayerOrderIndexes(layers);
  const edgeGroups = groupCrossingEdges(projection, orderIndexes);
  return [...edgeGroups.values()].reduce(
    (crossings, edges) => crossings + countEdgeGroupCrossings(edges),
    0,
  );
}

interface LayerOrderIndexes {
  rankByKey: Map<string, number>;
  orderByKey: Map<string, number>;
}

interface CrossingEdge {
  left: number;
  right: number;
}

interface EdgeCrossingState {
  edges: CrossingEdge[];
  counts: FenwickTree;
  inserted: number;
  crossings: number;
}

function getLayerOrderIndexes(layers: Map<number, string[]>): LayerOrderIndexes {
  const rankByKey = new Map<string, number>();
  const orderByKey = new Map<string, number>();
  for (const [rank, layer] of layers) {
    layer.forEach((key, index) => {
      rankByKey.set(key, rank);
      orderByKey.set(key, index);
    });
  }
  return { rankByKey, orderByKey };
}

function groupCrossingEdges(
  projection: Projection,
  orderIndexes: LayerOrderIndexes,
): Map<string, CrossingEdge[]> {
  const edgeGroups = new Map<string, CrossingEdge[]>();
  for (const [source, targets] of projection.outgoing) {
    for (const target of targets) {
      const group = getCrossingEdgeGroup(source, target, orderIndexes);
      if (!group) {
        continue;
      }
      const { groupKey, edge } = group;
      edgeGroups.set(groupKey, [...(edgeGroups.get(groupKey) ?? []), edge]);
    }
  }
  return edgeGroups;
}

function getCrossingEdgeGroup(
  source: string,
  target: string,
  orderIndexes: LayerOrderIndexes,
): { groupKey: string; edge: CrossingEdge } | undefined {
  const sourceRank = orderIndexes.rankByKey.get(source);
  const targetRank = orderIndexes.rankByKey.get(target);
  const sourceOrder = orderIndexes.orderByKey.get(source);
  const targetOrder = orderIndexes.orderByKey.get(target);
  if (
    sourceRank === undefined ||
    targetRank === undefined ||
    sourceOrder === undefined ||
    targetOrder === undefined ||
    sourceRank === targetRank
  ) {
    return undefined;
  }
  const ascending = sourceRank < targetRank;
  return {
    groupKey: ascending ? `${sourceRank}:${targetRank}` : `${targetRank}:${sourceRank}`,
    edge: ascending
      ? { left: sourceOrder, right: targetOrder }
      : { left: targetOrder, right: sourceOrder },
  };
}

function countEdgeGroupCrossings(edges: CrossingEdge[]): number {
  if (edges.length < 2) {
    return 0;
  }
  edges.sort((left, right) => left.left - right.left || left.right - right.right);
  const maximumRight = Math.max(...edges.map(({ right }) => right));
  const state: EdgeCrossingState = {
    edges,
    counts: new FenwickTree(maximumRight + 1),
    inserted: 0,
    crossings: 0,
  };
  let index = 0;
  while (index < edges.length) {
    const groupEnd = getSameLeftOrderEnd(edges, index);
    countCrossingsBeforeGroup(state, index, groupEnd);
    insertEdgeGroup(state, index, groupEnd);
    index = groupEnd;
  }
  return state.crossings;
}

function getSameLeftOrderEnd(edges: CrossingEdge[], start: number): number {
  let end = start + 1;
  while (end < edges.length && edges[end].left === edges[start].left) {
    end += 1;
  }
  return end;
}

function countCrossingsBeforeGroup(state: EdgeCrossingState, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    state.crossings += state.inserted - state.counts.getPrefixCount(state.edges[index].right);
  }
}

function insertEdgeGroup(state: EdgeCrossingState, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    state.counts.add(state.edges[index].right);
    state.inserted += 1;
  }
}

class FenwickTree {
  private readonly values: number[];

  constructor(size: number) {
    this.values = Array.from({ length: size + 1 }, () => 0);
  }

  add(index: number) {
    for (let current = index + 1; current < this.values.length; current += current & -current) {
      this.values[current] += 1;
    }
  }

  getPrefixCount(index: number) {
    let total = 0;
    for (let current = index + 1; current > 0; current -= current & -current) {
      total += this.values[current];
    }
    return total;
  }
}

function sortLayer(
  layers: Map<number, string[]>,
  rank: number,
  neighbors: Map<string, Set<string>>,
) {
  const layer = layers.get(rank);
  if (!layer || layer.length < 2) {
    return;
  }
  const order = new Map<string, number>();
  for (const current of layers.values()) {
    current.forEach((key, index) => order.set(key, index));
  }
  const previousOrder = new Map(layer.map((key, index) => [key, index]));
  layer.sort((left, right) => {
    const leftScore = getBarycenter(neighbors.get(left), order);
    const rightScore = getBarycenter(neighbors.get(right), order);
    if (leftScore !== undefined && rightScore !== undefined && leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    if (leftScore !== undefined && rightScore === undefined) {
      return -1;
    }
    if (leftScore === undefined && rightScore !== undefined) {
      return 1;
    }
    return requireDefined(previousOrder.get(left)) - requireDefined(previousOrder.get(right));
  });
}

function getBarycenter(neighbors: Set<string> | undefined, order: Map<string, number>) {
  const positions = [...(neighbors ?? [])].flatMap((key) => {
    const value = order.get(key);
    return value === undefined ? [] : [value];
  });
  if (positions.length === 0) {
    return undefined;
  }
  return positions.reduce((total, value) => total + value, 0) / positions.length;
}

function getSelectedKeys(projection: Projection, scope: StoryGraphLayoutScope): Set<string> {
  if (scope.kind === 'all') {
    return new Set(projection.vertices.map(({ key }) => key));
  }
  const selected = new Set<string>();
  for (const target of scope.targets) {
    if (target.type === 'interaction') {
      const key = getInteractionKey(target.interactionId);
      if (projection.byKey.has(key)) {
        selected.add(key);
      }
      continue;
    }
    const vertex = projection.vertices.find(
      (candidate) =>
        candidate.kind === 'trigger' &&
        candidate.interactionId === target.interactionId &&
        candidate.triggerIds?.includes(target.triggerId),
    );
    if (vertex) {
      selected.add(vertex.key);
    }
  }
  return selected;
}

function alignSelectionToFixedGraph(
  projection: Projection,
  canonical: ReadonlyMap<string, Position>,
  selected: Set<string>,
): Map<string, Position> {
  const boundaryKeys = getSelectionBoundaryKeys(projection, selected);
  const translation = getSelectionTranslation(projection, canonical, selected, boundaryKeys);
  const desired = getDesiredSelectionPositions(canonical, selected, translation);
  const collisionOffset = findCollisionFreeOffset(projection, desired, selected);
  return applyPositionOffset(desired, collisionOffset);
}

function getSelectionBoundaryKeys(projection: Projection, selected: Set<string>): Set<string> {
  const boundaryKeys = new Set<string>();
  for (const key of selected) {
    for (const neighbor of [
      ...(projection.incoming.get(key) ?? []),
      ...(projection.outgoing.get(key) ?? []),
    ]) {
      if (!selected.has(neighbor)) {
        boundaryKeys.add(neighbor);
      }
    }
  }
  return boundaryKeys;
}

function getSelectionTranslation(
  projection: Projection,
  canonical: ReadonlyMap<string, Position>,
  selected: Set<string>,
  boundaryKeys: Set<string>,
): Position {
  return boundaryKeys.size > 0
    ? getBoundaryTranslation(projection, canonical, boundaryKeys)
    : getCenterTranslation(projection, canonical, selected);
}

function getBoundaryTranslation(
  projection: Projection,
  canonical: ReadonlyMap<string, Position>,
  boundaryKeys: Set<string>,
): Position {
  return {
    x: median(
      [...boundaryKeys].map(
        (key) =>
          requireDefined(projection.byKey.get(key)).currentPosition.x -
          requireDefined(canonical.get(key)).x,
      ),
    ),
    y: median(
      [...boundaryKeys].map(
        (key) =>
          requireDefined(projection.byKey.get(key)).currentPosition.y -
          requireDefined(canonical.get(key)).y,
      ),
    ),
  };
}

function getCenterTranslation(
  projection: Projection,
  canonical: ReadonlyMap<string, Position>,
  selected: Set<string>,
): Position {
  const currentCenter = getPositionCenter(
    [...selected].map((key) => requireDefined(projection.byKey.get(key)).currentPosition),
  );
  const canonicalCenter = getPositionCenter(
    [...selected].map((key) => requireDefined(canonical.get(key))),
  );
  return {
    x: currentCenter.x - canonicalCenter.x,
    y: currentCenter.y - canonicalCenter.y,
  };
}

function getDesiredSelectionPositions(
  canonical: ReadonlyMap<string, Position>,
  selected: Set<string>,
  translation: Position,
): Map<string, Position> {
  return new Map(
    [...selected].map((key) => {
      const position = requireDefined(canonical.get(key));
      return [
        key,
        { x: Math.round(position.x + translation.x), y: Math.round(position.y + translation.y) },
      ];
    }),
  );
}

function applyPositionOffset(
  desired: Map<string, Position>,
  offset: Position,
): Map<string, Position> {
  return new Map(
    [...desired].map(([key, position]) => [
      key,
      { x: position.x + offset.x, y: position.y + offset.y },
    ]),
  );
}

function findCollisionFreeOffset(
  projection: Projection,
  desired: Map<string, Position>,
  selected: Set<string>,
): Position {
  const fixed = projection.vertices.filter((vertex) => !selected.has(vertex.key));
  const candidates: Position[] = [{ x: 0, y: 0 }];
  const interactionVertices = projection.vertices.filter(({ kind }) => kind === 'interaction');
  const xStep =
    Math.max(interactionNodeWidth, ...interactionVertices.map(({ width }) => width)) +
    horizontalGap;
  const yStep =
    Math.max(interactionNodeHeight, ...interactionVertices.map(({ height }) => height)) +
    verticalGap;
  for (let ring = 1; ring <= Math.max(8, fixed.length); ring += 1) {
    candidates.push(
      { x: ring * xStep, y: 0 },
      { x: -ring * xStep, y: 0 },
      { x: 0, y: ring * yStep },
      { x: 0, y: -ring * yStep },
      { x: ring * xStep, y: ring * yStep },
      { x: -ring * xStep, y: ring * yStep },
    );
  }

  return (
    candidates.find((offset) =>
      [...desired].every(([key, position]) => {
        const selectedVertex = requireDefined(projection.byKey.get(key));
        const moved = { x: position.x + offset.x, y: position.y + offset.y };
        return fixed.every(
          (fixedVertex) =>
            !rectanglesOverlap(selectedVertex, moved, fixedVertex, fixedVertex.currentPosition),
        );
      }),
    ) ?? { x: 0, y: 0 }
  );
}

function rectanglesOverlap(
  left: LayoutVertex,
  leftPosition: Position,
  right: LayoutVertex,
  rightPosition: Position,
) {
  const clearance = left.kind === 'interaction' || right.kind === 'interaction' ? 54 : 24;
  return !(
    leftPosition.x + left.width + clearance <= rightPosition.x ||
    rightPosition.x + right.width + clearance <= leftPosition.x ||
    leftPosition.y + left.height + clearance <= rightPosition.y ||
    rightPosition.y + right.height + clearance <= leftPosition.y
  );
}

function getPositionCenter(positions: Position[]): Position {
  return {
    x: positions.reduce((total, position) => total + position.x, 0) / positions.length,
    y: positions.reduce((total, position) => total + position.y, 0) / positions.length,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getMinimumOrder(keys: string[], projection: Projection) {
  return Math.min(...keys.map((key) => requireDefined(projection.byKey.get(key)).order));
}

function compareVertexOrder(left: LayoutVertex, right: LayoutVertex) {
  return left.order - right.order || left.key.localeCompare(right.key);
}

function getTriggerUpdateKey(update: TriggerPositionUpdate) {
  return `${update.interactionId}:${[...update.triggerIds].sort().join('|')}`;
}

function positionsEqual(left: Position, right: Position) {
  return left.x === right.x && left.y === right.y;
}

function getInteractionSize(
  interactionId: string,
  sizes: StoryGraphLayoutOptions['interactionSizes'],
) {
  const measured = sizes?.get(interactionId);
  return {
    width: getFinitePositiveDimension(measured?.width, interactionNodeWidth),
    height: getFinitePositiveDimension(measured?.height, interactionNodeHeight),
  };
}

function getFinitePositiveDimension(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : fallback;
}

function getInteractionKey(interactionId: string) {
  return `interaction:${interactionId}`;
}

function getTriggerKey(interactionId: string, triggerId: string) {
  return `trigger:${interactionId}:${triggerId}`;
}

function requireDefined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('Expected a story graph layout value to exist.');
  }
  return value;
}
