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
const triggerLayoutWidth = 68;
const horizontalGap = 110;
const verticalGap = 100;
const componentGap = 260;
const defaultOrigin = { x: 80, y: 120 };

export function computeStoryGraphLayout(
  story: Story,
  scope: StoryGraphLayoutScope,
): StoryGraphLayoutResult {
  const projection = buildProjection(story);
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

function buildProjection(story: Story): Projection {
  const vertices: LayoutVertex[] = story.interactions.map((interaction, index) => ({
    key: getInteractionKey(interaction.id),
    nodeId: interaction.id,
    kind: 'interaction',
    width: interactionNodeWidth,
    height: interactionNodeHeight,
    layoutWidth: interactionNodeWidth,
    currentPosition: interaction.position,
    order: index * 10_000,
    interactionId: interaction.id,
  }));
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

  return { positions, width };
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
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  let nextIndex = 0;

  const visit = (key: string) => {
    indices.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);

    const targets = [...(projection.outgoing.get(key) ?? [])]
      .filter((target) => allowed.has(target))
      .sort((left, right) =>
        compareVertexOrder(projection.byKey.get(left)!, projection.byKey.get(right)!),
      );
    for (const target of targets) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(key, Math.min(lowLinks.get(key)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(key, Math.min(lowLinks.get(key)!, indices.get(target)!));
      }
    }

    if (lowLinks.get(key) !== indices.get(key)) return;
    const members: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      members.push(member);
    } while (member !== key);
    result.push(members);
  };

  for (const key of [...component].sort((left, right) =>
    compareVertexOrder(projection.byKey.get(left)!, projection.byKey.get(right)!),
  )) {
    if (!indices.has(key)) visit(key);
  }
  return result;
}

function reduceCrossings(layers: Map<number, string[]>, projection: Projection) {
  const ranks = [...layers.keys()].sort((left, right) => left - right);
  for (let pass = 0; pass < 4; pass += 1) {
    for (const rank of ranks) sortLayer(layers, rank, projection.incoming);
    for (const rank of [...ranks].reverse()) sortLayer(layers, rank, projection.outgoing);
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
  const xStep = interactionNodeWidth + horizontalGap;
  const yStep = interactionNodeHeight + verticalGap;
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

function getInteractionKey(interactionId: string) {
  return `interaction:${interactionId}`;
}

function getTriggerKey(interactionId: string, triggerId: string) {
  return `trigger:${interactionId}:${triggerId}`;
}
