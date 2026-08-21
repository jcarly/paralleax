import type { Position, Story } from '@paralleax/shared';
import {
  getInteractionMovesTriggerPositionUpdates,
  getLinkedTriggerGroups,
  getTriggerNodeId,
  getTriggerNodePosition,
  interactionNodeHeight,
  interactionNodeWidth,
  type TriggerPositionUpdate,
} from './storyGraph';

export type StoryGraphLayoutTarget =
  | { type: 'interaction'; interactionId: string }
  | { type: 'trigger'; interactionId: string; triggerId: string };

export type StoryGraphLayoutScope =
  { kind: 'all' } | { kind: 'selection'; targets: readonly StoryGraphLayoutTarget[] };

export interface InteractionPositionUpdate {
  interactionId: string;
  position: Position;
}

export interface StoryGraphLayoutResult {
  interactionUpdates: InteractionPositionUpdate[];
  triggerUpdates: TriggerPositionUpdate[];
  affectedNodeIds: string[];
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

export function computeStoryGraphLayout(
  story: Story,
  scope: StoryGraphLayoutScope,
  options: StoryGraphLayoutOptions = {},
): StoryGraphLayoutResult {
  const projection = buildProjection(story, options);
  if (projection.vertices.length === 0) {
    return { interactionUpdates: [], triggerUpdates: [], affectedNodeIds: [] };
  }

  const canonicalPositions = layoutProjection(projection);
  const selectedKeys = getSelectedKeys(projection, scope);
  if (selectedKeys.size === 0) {
    return { interactionUpdates: [], triggerUpdates: [], affectedNodeIds: [] };
  }

  const positions =
    scope.kind === 'all'
      ? canonicalPositions
      : alignSelectionToFixedGraph(projection, canonicalPositions, selectedKeys);
  const interactionUpdates = projection.vertices.flatMap((vertex) => {
    if (vertex.kind !== 'interaction' || !selectedKeys.has(vertex.key)) return [];
    const position = positions.get(vertex.key);
    if (!position || positionsEqual(position, vertex.currentPosition)) return [];
    return [{ interactionId: vertex.interactionId, position }];
  });

  const interactionOverrides = new Map(
    interactionUpdates.map(({ interactionId, position }) => [interactionId, position]),
  );
  const triggerUpdatesByGroup = new Map<string, TriggerPositionUpdate>();

  if (scope.kind === 'selection') {
    for (const update of getInteractionMovesTriggerPositionUpdates(story, interactionOverrides)) {
      triggerUpdatesByGroup.set(getTriggerUpdateKey(update), update);
    }
  }

  for (const vertex of projection.vertices) {
    if (vertex.kind !== 'trigger' || !selectedKeys.has(vertex.key) || !vertex.triggerIds) continue;
    const position = positions.get(vertex.key);
    if (!position) continue;
    const owner = story.interactions.find(({ id }) => id === vertex.interactionId);
    const shouldUpdate = vertex.triggerIds.some((triggerId) => {
      const saved = owner?.triggers.find(({ id }) => id === triggerId)?.position;
      return !saved || !positionsEqual(saved, position);
    });
    if (!shouldUpdate) continue;
    const update = {
      interactionId: vertex.interactionId,
      triggerIds: vertex.triggerIds,
      position,
    };
    triggerUpdatesByGroup.set(getTriggerUpdateKey(update), update);
  }

  return {
    interactionUpdates,
    triggerUpdates: [...triggerUpdatesByGroup.values()],
    affectedNodeIds: projection.vertices
      .filter((vertex) => selectedKeys.has(vertex.key))
      .map((vertex) => vertex.nodeId),
  };
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
      vertices.push(triggerVertex);
      incoming.set(key, new Set());
      outgoing.set(key, new Set());

      for (const inputId of group.inputInteractionIds) {
        if (!knownInteractionIds.has(inputId)) continue;
        addEdge(getInteractionKey(inputId), key, incoming, outgoing);
      }
      addEdge(key, getInteractionKey(target.id), incoming, outgoing);
    });
  });

  return {
    vertices,
    byKey: new Map(vertices.map((vertex) => [vertex.key, vertex])),
    incoming,
    outgoing,
  };
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
    const leftX = Math.min(...left.map((key) => projection.byKey.get(key)!.currentPosition.x));
    const rightX = Math.min(...right.map((key) => projection.byKey.get(key)!.currentPosition.x));
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
    if (visited.has(vertex.key)) continue;
    const component: string[] = [];
    const pending = [vertex.key];
    visited.add(vertex.key);
    while (pending.length > 0) {
      const key = pending.shift()!;
      component.push(key);
      const neighbors = new Set([
        ...(projection.incoming.get(key) ?? []),
        ...(projection.outgoing.get(key) ?? []),
      ]);
      for (const neighbor of [...neighbors].sort((left, right) =>
        compareVertexOrder(projection.byKey.get(left)!, projection.byKey.get(right)!),
      )) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
}

function layoutComponent(
  component: string[],
  projection: Projection,
): { positions: Map<string, Position>; width: number } {
  const ranks = getRanks(component, projection);
  const layers = new Map<number, string[]>();
  for (const key of component) {
    const rank = ranks.get(key) ?? 0;
    layers.set(rank, [...(layers.get(rank) ?? []), key]);
  }
  for (const layer of layers.values()) {
    layer.sort((left, right) => {
      const leftVertex = projection.byKey.get(left)!;
      const rightVertex = projection.byKey.get(right)!;
      return (
        leftVertex.currentPosition.x - rightVertex.currentPosition.x ||
        compareVertexOrder(leftVertex, rightVertex)
      );
    });
  }

  reduceCrossings(layers, projection);
  const layerWidths = new Map<number, number>();
  const layerHeights = new Map<number, number>();
  for (const [rank, layer] of layers) {
    layerWidths.set(
      rank,
      layer.reduce((total, key) => total + projection.byKey.get(key)!.layoutWidth, 0) +
        Math.max(0, layer.length - 1) * horizontalGap,
    );
    layerHeights.set(rank, Math.max(...layer.map((key) => projection.byKey.get(key)!.height)));
  }

  const width = Math.max(...layerWidths.values(), interactionNodeWidth);
  const positions = new Map<string, Position>();
  const maximumRank = Math.max(...layers.keys());
  let y = 0;
  for (let rank = 0; rank <= maximumRank; rank += 1) {
    const layer = layers.get(rank);
    if (!layer) {
      y += triggerNodeSize + verticalGap;
      continue;
    }
    const layerWidth = layerWidths.get(rank)!;
    const layerHeight = layerHeights.get(rank)!;
    let x = (width - layerWidth) / 2;
    for (const key of layer) {
      const vertex = projection.byKey.get(key)!;
      positions.set(key, {
        x: x + (vertex.layoutWidth - vertex.width) / 2,
        y: y + (layerHeight - vertex.height) / 2,
      });
      x += vertex.layoutWidth + horizontalGap;
    }
    y += layerHeight + verticalGap;
  }

  alignLayersToSuccessors(layers, projection, positions, width);

  return { positions, width };
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
      if (!layer || layer.length === 0) continue;
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
  const vertices = layer.map((key) => projection.byKey.get(key)!);
  const centers = vertices.map((vertex) => {
    const currentCenter = getVertexCenter(vertex, positions.get(vertex.key)!);
    const successorCenters = [...(projection.outgoing.get(vertex.key) ?? [])]
      .flatMap((key) => {
        const successor = projection.byKey.get(key);
        const position = positions.get(key);
        return successor && position ? [getVertexCenter(successor, position)] : [];
      })
      .sort((left, right) => left - right);
    return successorCenters.length > 0 ? getMedian(successorCenters) : currentCenter;
  });

  for (let index = 1; index < centers.length; index += 1) {
    centers[index] = Math.max(
      centers[index],
      centers[index - 1] + getMinimumCenterGap(vertices[index - 1], vertices[index]),
    );
  }

  const rightLimit = width - vertices.at(-1)!.layoutWidth / 2;
  const overflow = centers.at(-1)! - rightLimit;
  if (overflow > 0) centers.forEach((center, index) => (centers[index] = center - overflow));

  for (let index = centers.length - 2; index >= 0; index -= 1) {
    centers[index] = Math.min(
      centers[index],
      centers[index + 1] - getMinimumCenterGap(vertices[index], vertices[index + 1]),
    );
  }

  const leftLimit = vertices[0].layoutWidth / 2;
  const underflow = leftLimit - centers[0];
  if (underflow > 0) centers.forEach((center, index) => (centers[index] = center + underflow));

  vertices.forEach((vertex, index) => {
    const position = positions.get(vertex.key)!;
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
  const componentByVertex = new Map<string, number>();
  strongComponents.forEach((members, index) => {
    members.forEach((key) => componentByVertex.set(key, index));
  });
  const predecessors = strongComponents.map(() => new Set<number>());
  const successors = strongComponents.map(() => new Set<number>());
  for (const source of component) {
    for (const target of projection.outgoing.get(source) ?? []) {
      const sourceComponent = componentByVertex.get(source)!;
      const targetComponent = componentByVertex.get(target)!;
      if (sourceComponent === targetComponent) continue;
      successors[sourceComponent].add(targetComponent);
      predecessors[targetComponent].add(sourceComponent);
    }
  }

  const componentOrder = strongComponents.map((members) => getMinimumOrder(members, projection));
  const indegrees = predecessors.map((items) => items.size);
  const pending = indegrees
    .map((indegree, index) => ({ indegree, index }))
    .filter(({ indegree }) => indegree === 0)
    .map(({ index }) => index)
    .sort((left, right) => componentOrder[left] - componentOrder[right]);
  const bases = strongComponents.map(() => 0);
  const orderedComponents: number[] = [];
  while (pending.length > 0) {
    const componentIndex = pending.shift()!;
    orderedComponents.push(componentIndex);
    for (const successor of successors[componentIndex]) {
      bases[successor] = Math.max(
        bases[successor],
        bases[componentIndex] + strongComponents[componentIndex].length,
      );
      indegrees[successor] -= 1;
      if (indegrees[successor] === 0) {
        pending.push(successor);
        pending.sort((left, right) => componentOrder[left] - componentOrder[right]);
      }
    }
  }

  const ranks = new Map<string, number>();
  for (const componentIndex of orderedComponents) {
    const members = [...strongComponents[componentIndex]].sort((left, right) => {
      const leftVertex = projection.byKey.get(left)!;
      const rightVertex = projection.byKey.get(right)!;
      return (
        leftVertex.currentPosition.y - rightVertex.currentPosition.y ||
        leftVertex.currentPosition.x - rightVertex.currentPosition.x ||
        compareVertexOrder(leftVertex, rightVertex)
      );
    });
    members.forEach((key, memberIndex) => ranks.set(key, bases[componentIndex] + memberIndex));
  }
  return ranks;
}

function getStrongComponents(component: string[], projection: Projection): string[][] {
  const allowed = new Set(component);
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const componentStack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  let nextIndex = 0;

  const openVertex = (key: string) => {
    indices.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    componentStack.push(key);
    onStack.add(key);
  };
  const getTargets = (key: string) =>
    [...(projection.outgoing.get(key) ?? [])]
      .filter((target) => allowed.has(target))
      .sort((left, right) =>
        compareVertexOrder(projection.byKey.get(left)!, projection.byKey.get(right)!),
      );

  for (const key of [...component].sort((left, right) =>
    compareVertexOrder(projection.byKey.get(left)!, projection.byKey.get(right)!),
  )) {
    if (indices.has(key)) continue;
    openVertex(key);
    const traversalStack: Array<{
      key: string;
      parent?: string;
      targets: string[];
      nextTargetIndex: number;
    }> = [{ key, targets: getTargets(key), nextTargetIndex: 0 }];

    while (traversalStack.length > 0) {
      const frame = traversalStack.at(-1)!;
      const target = frame.targets[frame.nextTargetIndex];
      if (target !== undefined) {
        frame.nextTargetIndex += 1;
        if (!indices.has(target)) {
          openVertex(target);
          traversalStack.push({
            key: target,
            parent: frame.key,
            targets: getTargets(target),
            nextTargetIndex: 0,
          });
        } else if (onStack.has(target)) {
          lowLinks.set(frame.key, Math.min(lowLinks.get(frame.key)!, indices.get(target)!));
        }
        continue;
      }

      traversalStack.pop();
      if (frame.parent !== undefined) {
        lowLinks.set(frame.parent, Math.min(lowLinks.get(frame.parent)!, lowLinks.get(frame.key)!));
      }
      if (lowLinks.get(frame.key) !== indices.get(frame.key)) continue;
      const members: string[] = [];
      let member: string;
      do {
        member = componentStack.pop()!;
        onStack.delete(member);
        members.push(member);
      } while (member !== frame.key);
      result.push(members);
    }
  }
  return result;
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
    for (const rank of ranks) sortLayer(layers, rank, projection.incoming);
    keepBestOrder();
    for (const rank of [...ranks].reverse()) sortLayer(layers, rank, projection.outgoing);
    keepBestOrder();
  }
  for (const [rank, layer] of bestLayers) {
    layers.set(rank, layer);
  }
  optimizeAdjacentLayerSwaps(layers, projection);
}

function optimizeAdjacentLayerSwaps(layers: Map<number, string[]>, projection: Projection) {
  let crossingCount = countLayerCrossings(layers, projection);
  let edgeSpan = getLayerEdgeSpan(layers, projection);
  const ranks = [...layers.keys()].sort((left, right) => left - right);

  for (let pass = 0; pass < 4; pass += 1) {
    let improved = false;
    for (const rank of ranks) {
      const layer = layers.get(rank);
      if (!layer || layer.length < 2) continue;
      for (let index = 0; index < layer.length - 1; index += 1) {
        [layer[index], layer[index + 1]] = [layer[index + 1], layer[index]];
        const candidateCrossingCount = countLayerCrossings(layers, projection);
        const candidateEdgeSpan = getLayerEdgeSpan(layers, projection);
        const isBetter =
          candidateCrossingCount < crossingCount ||
          (candidateCrossingCount === crossingCount && candidateEdgeSpan < edgeSpan);
        if (isBetter) {
          crossingCount = candidateCrossingCount;
          edgeSpan = candidateEdgeSpan;
          improved = true;
        } else {
          [layer[index], layer[index + 1]] = [layer[index + 1], layer[index]];
        }
      }
    }
    if (!improved) return;
  }
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
    if (sourceOrder === undefined) continue;
    for (const target of targets) {
      const targetOrder = normalizedOrder.get(target);
      if (targetOrder !== undefined) span += Math.abs(sourceOrder - targetOrder);
    }
  }
  return span;
}

function countLayerCrossings(layers: Map<number, string[]>, projection: Projection) {
  const rankByKey = new Map<string, number>();
  const orderByKey = new Map<string, number>();
  for (const [rank, layer] of layers) {
    layer.forEach((key, index) => {
      rankByKey.set(key, rank);
      orderByKey.set(key, index);
    });
  }

  const edgeGroups = new Map<string, Array<{ left: number; right: number }>>();
  for (const [source, targets] of projection.outgoing) {
    for (const target of targets) {
      const sourceRank = rankByKey.get(source);
      const targetRank = rankByKey.get(target);
      const sourceOrder = orderByKey.get(source);
      const targetOrder = orderByKey.get(target);
      if (
        sourceRank === undefined ||
        targetRank === undefined ||
        sourceOrder === undefined ||
        targetOrder === undefined ||
        sourceRank === targetRank
      ) {
        continue;
      }
      const ascending = sourceRank < targetRank;
      const firstRank = ascending ? sourceRank : targetRank;
      const secondRank = ascending ? targetRank : sourceRank;
      const edge = ascending
        ? { left: sourceOrder, right: targetOrder }
        : { left: targetOrder, right: sourceOrder };
      const groupKey = `${firstRank}:${secondRank}`;
      edgeGroups.set(groupKey, [...(edgeGroups.get(groupKey) ?? []), edge]);
    }
  }

  let crossings = 0;
  for (const edges of edgeGroups.values()) {
    if (edges.length < 2) continue;
    edges.sort((left, right) => left.left - right.left || left.right - right.right);
    const maximumRight = Math.max(...edges.map(({ right }) => right));
    const counts = new FenwickTree(maximumRight + 1);
    let inserted = 0;
    let index = 0;
    while (index < edges.length) {
      let groupEnd = index + 1;
      while (groupEnd < edges.length && edges[groupEnd].left === edges[index].left) {
        groupEnd += 1;
      }
      for (let edgeIndex = index; edgeIndex < groupEnd; edgeIndex += 1) {
        crossings += inserted - counts.getPrefixCount(edges[edgeIndex].right);
      }
      for (let edgeIndex = index; edgeIndex < groupEnd; edgeIndex += 1) {
        counts.add(edges[edgeIndex].right);
        inserted += 1;
      }
      index = groupEnd;
    }
  }
  return crossings;
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
  if (!layer || layer.length < 2) return;
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
    if (leftScore !== undefined && rightScore === undefined) return -1;
    if (leftScore === undefined && rightScore !== undefined) return 1;
    return previousOrder.get(left)! - previousOrder.get(right)!;
  });
}

function getBarycenter(neighbors: Set<string> | undefined, order: Map<string, number>) {
  const positions = [...(neighbors ?? [])].flatMap((key) => {
    const value = order.get(key);
    return value === undefined ? [] : [value];
  });
  if (positions.length === 0) return undefined;
  return positions.reduce((total, value) => total + value, 0) / positions.length;
}

function getSelectedKeys(projection: Projection, scope: StoryGraphLayoutScope): Set<string> {
  if (scope.kind === 'all') return new Set(projection.vertices.map(({ key }) => key));
  const selected = new Set<string>();
  for (const target of scope.targets) {
    if (target.type === 'interaction') {
      const key = getInteractionKey(target.interactionId);
      if (projection.byKey.has(key)) selected.add(key);
      continue;
    }
    const vertex = projection.vertices.find(
      (candidate) =>
        candidate.kind === 'trigger' &&
        candidate.interactionId === target.interactionId &&
        candidate.triggerIds?.includes(target.triggerId),
    );
    if (vertex) selected.add(vertex.key);
  }
  return selected;
}

function alignSelectionToFixedGraph(
  projection: Projection,
  canonical: Map<string, Position>,
  selected: Set<string>,
): Map<string, Position> {
  const boundaryKeys = new Set<string>();
  for (const key of selected) {
    for (const neighbor of [
      ...(projection.incoming.get(key) ?? []),
      ...(projection.outgoing.get(key) ?? []),
    ]) {
      if (!selected.has(neighbor)) boundaryKeys.add(neighbor);
    }
  }

  let translation: Position;
  if (boundaryKeys.size > 0) {
    translation = {
      x: median(
        [...boundaryKeys].map(
          (key) => projection.byKey.get(key)!.currentPosition.x - canonical.get(key)!.x,
        ),
      ),
      y: median(
        [...boundaryKeys].map(
          (key) => projection.byKey.get(key)!.currentPosition.y - canonical.get(key)!.y,
        ),
      ),
    };
  } else {
    const currentCenter = getPositionCenter(
      [...selected].map((key) => projection.byKey.get(key)!.currentPosition),
    );
    const canonicalCenter = getPositionCenter([...selected].map((key) => canonical.get(key)!));
    translation = {
      x: currentCenter.x - canonicalCenter.x,
      y: currentCenter.y - canonicalCenter.y,
    };
  }

  const desired = new Map(
    [...selected].map((key) => {
      const position = canonical.get(key)!;
      return [
        key,
        { x: Math.round(position.x + translation.x), y: Math.round(position.y + translation.y) },
      ];
    }),
  );
  const collisionOffset = findCollisionFreeOffset(projection, desired, selected);
  return new Map(
    [...desired].map(([key, position]) => [
      key,
      { x: position.x + collisionOffset.x, y: position.y + collisionOffset.y },
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
        const selectedVertex = projection.byKey.get(key)!;
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
  return Math.min(...keys.map((key) => projection.byKey.get(key)!.order));
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
