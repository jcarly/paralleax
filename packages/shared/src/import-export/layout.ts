export interface ImportedGraphNode {
  key: string;
}

export interface ImportedGraphEdge {
  from: string;
  to: string;
}

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
  while (queue.length > 0) {
    const key = queue.shift()!;
    processed.add(key);
    for (const target of outgoing.get(key) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(key) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  let fallbackDepth = Math.max(0, ...depth.values());
  for (const node of nodes) if (!processed.has(node.key)) depth.set(node.key, ++fallbackDepth);
  const layers = new Map<number, string[]>();
  for (const node of nodes) {
    const layer = depth.get(node.key) ?? 0;
    layers.set(layer, [...(layers.get(layer) ?? []), node.key]);
  }
  const result = new Map<string, { x: number; y: number }>();
  for (const [layer, keys] of layers) {
    keys.forEach((key, index) => result.set(key, { x: 80 + index * 320, y: 120 + layer * 220 }));
  }
  return result;
}
