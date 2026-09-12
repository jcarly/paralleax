import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';

const transientNodeKeys = new Set([
  'dragging',
  'height',
  'initialHeight',
  'initialWidth',
  'measured',
  'resizing',
  'width',
]);

export function reconcileStoryFlowNodes(
  currentNodes: readonly StoryFlowNode[],
  projectedNodes: readonly StoryFlowNode[],
): StoryFlowNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));

  return projectedNodes.map((projectedNode) => {
    const currentNode = currentById.get(projectedNode.id);
    if (!currentNode || currentNode.type !== projectedNode.type) return projectedNode;
    if (haveSameProjection(currentNode, projectedNode, transientNodeKeys)) return currentNode;

    return preserveMeasuredNodeState(currentNode, projectedNode);
  });
}

export function reconcileStoryFlowEdges(
  currentEdges: readonly TriggerFlowEdge[],
  projectedEdges: readonly TriggerFlowEdge[],
): TriggerFlowEdge[] {
  const currentById = new Map(currentEdges.map((edge) => [edge.id, edge]));

  return projectedEdges.map((projectedEdge) => {
    const currentEdge = currentById.get(projectedEdge.id);
    return currentEdge && haveSameProjection(currentEdge, projectedEdge)
      ? currentEdge
      : projectedEdge;
  });
}

function preserveMeasuredNodeState(
  currentNode: StoryFlowNode,
  projectedNode: StoryFlowNode,
): StoryFlowNode {
  const reconciledNode = { ...projectedNode } as StoryFlowNode & Record<string, unknown>;
  const currentRecord = currentNode as StoryFlowNode & Record<string, unknown>;

  for (const key of transientNodeKeys) {
    if (!(key in projectedNode) && key in currentRecord) {
      reconciledNode[key] = currentRecord[key];
    }
  }

  return reconciledNode;
}

function haveSameProjection(
  current: Record<string, unknown>,
  projected: Record<string, unknown>,
  ignoredCurrentKeys: ReadonlySet<string> = new Set(),
) {
  const projectedKeys = Object.keys(projected);
  const hasRemovedProjectedValue = Object.keys(current).some(
    (key) => !ignoredCurrentKeys.has(key) && !(key in projected),
  );

  return (
    !hasRemovedProjectedValue &&
    projectedKeys.every(
      (key) => key in current && areProjectionValuesEqual(current[key], projected[key]),
    )
  );
}

function areProjectionValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areProjectionValuesEqual(value, right[index]))
    );
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => key in rightRecord && areProjectionValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}
