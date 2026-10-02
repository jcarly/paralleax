import type { Page } from '@playwright/test';
import type {
  LayoutEdgePath,
  LayoutGeometryReport,
  LayoutNodeBounds,
} from '../../src/test/layoutGeometry';

export interface RenderedLayout {
  nodes: LayoutNodeBounds[];
  edges: LayoutEdgePath[];
}

export const pathApproximationTolerance = 0.1;

/** Read the actual renderer, independent of the algorithm used to position its nodes. */
export async function readRenderedLayout(
  page: Page,
  connections: Array<{ id: string; source: string; target: string }>,
): Promise<RenderedLayout> {
  return page.evaluate(
    ({ connections, tolerance }) => {
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')!;
      const origin = viewport.getBoundingClientRect();
      const scale = new DOMMatrix(getComputedStyle(viewport).transform).a;
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid graph viewport scale');
      const nodes = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].map(
        (element) => {
          const box = element.getBoundingClientRect();
          return {
            id: element.dataset.id!,
            x: (box.x - origin.x) / scale,
            y: (box.y - origin.y) / scale,
            width: box.width / scale,
            height: box.height / scale,
          };
        },
      );
      const byId = new Map(connections.map((edge) => [edge.id, edge]));
      const edges = [...document.querySelectorAll<SVGGElement>('.react-flow__edge')].map(
        (element) => {
          const id = element.dataset.id!;
          const connection = byId.get(id);
          const path = element.querySelector<SVGPathElement>('.react-flow__edge-path');
          if (!connection || !path) throw new Error(`Missing rendered edge metadata: ${id}`);
          const length = path.getTotalLength();
          const matrix = path.getScreenCTM();
          if (!matrix || !Number.isFinite(length) || length <= 0) {
            throw new Error(`Invalid rendered edge path: ${id}`);
          }
          const pointAt = (distance: number) => {
            const point = path.getPointAtLength(distance);
            const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
            return { x: (screen.x - origin.x) / scale, y: (screen.y - origin.y) / scale };
          };
          const first = pointAt(0);
          const points = [first];
          const append = (
            from: number,
            to: number,
            start: { x: number; y: number },
            end: { x: number; y: number },
            depth: number,
          ) => {
            const middle = pointAt((from + to) / 2);
            const chord = Math.hypot(end.x - start.x, end.y - start.y);
            const deviation = chord
              ? Math.abs(
                  (end.x - start.x) * (start.y - middle.y) -
                    (start.x - middle.x) * (end.y - start.y),
                ) / chord
              : Math.hypot(middle.x - start.x, middle.y - start.y);
            // Arc length detects return bends even if their midpoint lies on the chord.
            if (to - from - chord > tolerance || deviation > tolerance) {
              if (depth >= 24) throw new Error(`Path approximation did not converge: ${id}`);
              const half = (from + to) / 2;
              append(from, half, start, middle, depth + 1);
              append(half, to, middle, end, depth + 1);
            } else {
              points.push(end);
            }
          };
          append(0, length, first, pointAt(length), 0);
          return { ...connection, points };
        },
      );
      return { nodes, edges };
    },
    { connections, tolerance: pathApproximationTolerance },
  );
}

export function summarizeLayout(report: LayoutGeometryReport) {
  return {
    nodeOverlaps: report.nodeOverlaps.length,
    edgeNodeIntersections: report.edgeNodeIntersections.length,
    edgeCrossings: report.edgeCrossings.length,
    edgeOverlaps: report.edgeOverlaps.length,
  };
}

/** A portable, zoomable artifact; red routes and orange nodes identify offending IDs. */
export function renderLayoutSvg(
  layout: RenderedLayout,
  report: LayoutGeometryReport,
  title: string,
) {
  const points = [
    ...layout.nodes.flatMap((node) => [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y + node.height },
    ]),
    ...layout.edges.flatMap((edge) => edge.points),
  ];
  const minX = Math.min(...points.map(({ x }) => x)) - 40;
  const minY = Math.min(...points.map(({ y }) => y)) - 80;
  const width = Math.max(...points.map(({ x }) => x)) - minX + 40;
  const height = Math.max(...points.map(({ y }) => y)) - minY + 40;
  const badEdges = new Set([
    ...report.edgeNodeIntersections.map(({ edgeId }) => edgeId),
    ...[...report.edgeCrossings, ...report.edgeOverlaps].flatMap(({ edgeA, edgeB }) => [
      edgeA,
      edgeB,
    ]),
  ]);
  const badNodes = new Set([
    ...report.nodeOverlaps.flatMap(({ nodeA, nodeB }) => [nodeA, nodeB]),
    ...report.edgeNodeIntersections.map(({ nodeId }) => nodeId),
  ]);
  const routes = layout.edges.map(
    (edge) =>
      `<polyline points="${edge.points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="${badEdges.has(edge.id) ? '#bc3548' : '#708090'}" stroke-width="2"><title>${escapeXml(edge.id)}</title></polyline>`,
  );
  const nodes = layout.nodes.map(
    (node) =>
      `<g><title>${escapeXml(node.id)}</title><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="4" fill="#fff" stroke="${badNodes.has(node.id) ? '#d87914' : '#315a4a'}" stroke-width="2"/>${node.width > 50 ? `<text x="${node.x + 8}" y="${node.y + 22}" font-size="12">${escapeXml(node.id)}</text>` : ''}</g>`,
  );
  const crossings = report.edgeCrossings.map(
    ({ point }) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#b321cf"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${Math.ceil(width)}" height="${Math.ceil(height)}"><title>${escapeXml(title)}</title><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#fafaf8"/><text x="${minX + 20}" y="${minY + 30}" font-family="sans-serif" font-size="18">${escapeXml(title)} — ${escapeXml(JSON.stringify(summarizeLayout(report)))}</text>${routes.join('')}${nodes.join('')}${crossings.join('')}</svg>`;
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character];
  });
}
