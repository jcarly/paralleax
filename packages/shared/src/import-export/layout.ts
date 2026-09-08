export interface ImportedGraphNode {
  key: string;
}

export interface ImportedGraphEdge {
  from: string;
  to: string;
}

const MAX_IMPORTED_NODES_PER_ROW = 8;

export function layoutImportedGraph(
  nodes: readonly ImportedGraphNode[],
  edges: readonly ImportedGraphEdge[],
) {
  const indegree = new Map(nodes.map(({ key }) => [key, 0]));
  const outgoing = new Map(nodes.map(({ key }) => [key, [] as string[]]));
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const depth = new Map(nodes.map(({ key }) => [key, 0]));
  const queue = nodes.filter(({ key }) => indegree.get(key) === 0).map(({ key }) => key);
  const processed = new Set<string>();
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const key = queue[queueIndex++];
    processed.add(key);
    for (const target of outgoing.get(key) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(key) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  let fallbackDepth = 0;
  for (const value of depth.values()) fallbackDepth = Math.max(fallbackDepth, value);
  for (const node of nodes) if (!processed.has(node.key)) depth.set(node.key, fallbackDepth + 1);
  const layers = new Map<number, string[]>();
  for (const node of nodes) {
    const layer = depth.get(node.key) ?? 0;
    const keys = layers.get(layer);
    if (keys) keys.push(node.key);
    else layers.set(layer, [node.key]);
  }
  const result = new Map<string, { x: number; y: number }>();
  let visualRow = 0;
  for (const [, keys] of [...layers].sort(([left], [right]) => left - right)) {
    keys.forEach((key, index) =>
      result.set(key, {
        x: 80 + (index % MAX_IMPORTED_NODES_PER_ROW) * 320,
        y: 120 + (visualRow + Math.floor(index / MAX_IMPORTED_NODES_PER_ROW)) * 220,
      }),
    );
    visualRow += Math.ceil(keys.length / MAX_IMPORTED_NODES_PER_ROW);
  }
  return result;
}
