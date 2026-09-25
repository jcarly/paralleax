export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutNodeBounds extends LayoutPoint {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdgePath {
  id: string;
  source: string;
  target: string;
  points: LayoutPoint[];
}

export interface LayoutGeometryReport {
  nodeOverlaps: { nodeA: string; nodeB: string }[];
  edgeNodeIntersections: { edgeId: string; nodeId: string }[];
  edgeCrossings: { edgeA: string; edgeB: string; point: LayoutPoint }[];
  edgeOverlaps: { edgeA: string; edgeB: string }[];
}

/** Graph-coordinate units, independent of the current browser zoom. */
export const layoutGeometryTolerance = 0.25;
/** Handles may sit slightly inside their own node's measured bounding box. */
export const layoutEndpointStubAllowance = 12;
const numericTolerance = 1e-9;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Segment extends Bounds {
  start: LayoutPoint;
  end: LayoutPoint;
  length: number;
  offset: number;
}

interface PreparedEdge extends LayoutEdgePath {
  segments: Segment[];
  length: number;
  bounds: Bounds;
}

interface SharedRun {
  aEnd: boolean;
  bEnd: boolean;
  length: number;
}

type SegmentContact =
  | { kind: 'crossing'; point: LayoutPoint; aOffset: number; bOffset: number }
  | { kind: 'overlap'; startA: number; endA: number; startB: number; endB: number };

/**
 * Test-only audit of sampled rendered paths, not the layout algorithm's ranks.
 * Node borders within 0.25 units and tangent-only edge contacts are ignored.
 * Common prefixes/suffixes at the same graph port are legitimate bundles; sharing
 * a node never exempts contacts after those paths diverge. Each overlap pair and
 * edge/node pair is reported once; separate transverse crossings are retained.
 * Curves are as accurate as the supplied polyline sampling, not SVG-exact.
 */
export function analyzeLayoutGeometry(
  nodes: LayoutNodeBounds[],
  edges: LayoutEdgePath[],
): LayoutGeometryReport {
  const report: LayoutGeometryReport = {
    nodeOverlaps: [],
    edgeNodeIntersections: [],
    edgeCrossings: [],
    edgeOverlaps: [],
  };
  const preparedNodes = nodes.map((node) => ({
    ...node,
    minX: node.x,
    minY: node.y,
    maxX: node.x + node.width,
    maxY: node.y + node.height,
  }));
  const preparedEdges = edges.map(prepareEdge);

  preparedNodes.forEach((node, index) => {
    for (const other of preparedNodes.slice(index + 1)) {
      if (
        Math.min(node.maxX, other.maxX) - Math.max(node.minX, other.minX) >
          layoutGeometryTolerance &&
        Math.min(node.maxY, other.maxY) - Math.max(node.minY, other.minY) > layoutGeometryTolerance
      ) {
        report.nodeOverlaps.push({ nodeA: node.id, nodeB: other.id });
      }
    }
  });

  for (const edge of preparedEdges) {
    for (const node of preparedNodes) {
      if (!boundsTouch(edge.bounds, node)) continue;
      const inner = {
        minX: node.minX + layoutGeometryTolerance,
        minY: node.minY + layoutGeometryTolerance,
        maxX: node.maxX - layoutGeometryTolerance,
        maxY: node.maxY - layoutGeometryTolerance,
      };
      if (inner.minX >= inner.maxX || inner.minY >= inner.maxY) continue;
      const allowedStart = edge.source === node.id ? layoutEndpointStubAllowance : 0;
      const allowedEnd = edge.length - (edge.target === node.id ? layoutEndpointStubAllowance : 0);
      const interiorIntervals: [number, number][] = [];
      for (const segment of edge.segments) {
        if (!boundsTouch(segment, inner)) continue;
        const interval = rectangleInterval(segment, inner);
        if (!interval) continue;
        const start = Math.max(segment.offset + interval[0] * segment.length, allowedStart);
        const end = Math.min(segment.offset + interval[1] * segment.length, allowedEnd);
        if (end - start > numericTolerance) interiorIntervals.push([start, end]);
      }
      if (hasSignificantContinuousInterval(interiorIntervals)) {
        report.edgeNodeIntersections.push({ edgeId: edge.id, nodeId: node.id });
      }
    }
  }

  preparedEdges.forEach((edge, index) => {
    for (const other of preparedEdges.slice(index + 1)) {
      if (!boundsTouch(edge.bounds, other.bounds)) continue;
      const sharedRuns = findSharedRuns(edge, other);
      const crossings: LayoutPoint[] = [];
      const overlapIntervals: [number, number][] = [];
      for (const segment of edge.segments) {
        if (!boundsTouch(segment, other.bounds)) continue;
        for (const otherSegment of other.segments) {
          if (!boundsTouch(segment, otherSegment)) continue;
          const contact = segmentContact(segment, otherSegment);
          if (!contact) continue;
          if (contact.kind === 'overlap') {
            if (
              !sharedRuns.some(
                (run) =>
                  isWithinSharedRun(run, edge, other, contact.startA, contact.startB) &&
                  isWithinSharedRun(run, edge, other, contact.endA, contact.endB),
              )
            ) {
              overlapIntervals.push([contact.startA, contact.endA]);
            }
          } else if (
            !sharedRuns.some((run) =>
              isWithinSharedRun(run, edge, other, contact.aOffset, contact.bOffset),
            ) &&
            !crossings.some((point) => distance(point, contact.point) <= layoutGeometryTolerance) &&
            isTransverseCrossing(edge, other, contact.aOffset, contact.bOffset, contact.point)
          ) {
            crossings.push(contact.point);
          }
        }
      }
      report.edgeCrossings.push(
        ...crossings.map((point) => ({ edgeA: edge.id, edgeB: other.id, point })),
      );
      if (hasSignificantContinuousInterval(overlapIntervals)) {
        report.edgeOverlaps.push({ edgeA: edge.id, edgeB: other.id });
      }
    }
  });
  return report;
}

function prepareEdge(edge: LayoutEdgePath): PreparedEdge {
  const segments: Segment[] = [];
  let length = 0;
  for (let index = 1; index < edge.points.length; index += 1) {
    const start = edge.points[index - 1];
    const end = edge.points[index];
    const segmentLength = distance(start, end);
    if (segmentLength <= numericTolerance) continue;
    const previous = segments[segments.length - 1];
    if (previous) {
      const before = subtract(previous.end, previous.start);
      const after = subtract(end, start);
      // Sampling a straight run more densely must not shorten the portion used
      // to distinguish a genuine shallow crossing from SVG coordinate noise.
      if (
        Math.abs(cross(before, after)) <= numericTolerance * previous.length * segmentLength &&
        before.x * after.x + before.y * after.y > 0
      ) {
        previous.end = end;
        previous.length = distance(previous.start, end);
        previous.minX = Math.min(previous.start.x, end.x);
        previous.minY = Math.min(previous.start.y, end.y);
        previous.maxX = Math.max(previous.start.x, end.x);
        previous.maxY = Math.max(previous.start.y, end.y);
        length = previous.offset + previous.length;
        continue;
      }
    }
    segments.push({
      start,
      end,
      length: segmentLength,
      offset: length,
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    });
    length += segmentLength;
  }
  return {
    ...edge,
    segments,
    length,
    bounds: {
      minX: Math.min(...edge.points.map((point) => point.x)),
      minY: Math.min(...edge.points.map((point) => point.y)),
      maxX: Math.max(...edge.points.map((point) => point.x)),
      maxY: Math.max(...edge.points.map((point) => point.y)),
    },
  };
}

function distance(a: LayoutPoint, b: LayoutPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Apply the visual tolerance to a continuous contact, independent of sample density. */
function hasSignificantContinuousInterval(intervals: [number, number][]) {
  intervals.sort(([left], [right]) => left - right);
  let runStart = 0;
  let runEnd = -Infinity;
  for (const [start, end] of intervals) {
    if (start > runEnd + numericTolerance) {
      runStart = start;
      runEnd = end;
    } else {
      runEnd = Math.max(runEnd, end);
    }
    if (runEnd - runStart > layoutGeometryTolerance) return true;
  }
  return false;
}

function boundsTouch(a: Bounds, b: Bounds) {
  return (
    a.minX <= b.maxX + layoutGeometryTolerance &&
    b.minX <= a.maxX + layoutGeometryTolerance &&
    a.minY <= b.maxY + layoutGeometryTolerance &&
    b.minY <= a.maxY + layoutGeometryTolerance
  );
}

function cross(a: LayoutPoint, b: LayoutPoint) {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: LayoutPoint, b: LayoutPoint): LayoutPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

function interpolate(segment: Segment, fraction: number): LayoutPoint {
  return {
    x: segment.start.x + (segment.end.x - segment.start.x) * fraction,
    y: segment.start.y + (segment.end.y - segment.start.y) * fraction,
  };
}

function rectangleInterval(segment: Segment, rectangle: Bounds): [number, number] | null {
  let start = 0;
  let end = 1;
  for (const axis of ['x', 'y'] as const) {
    const origin = segment.start[axis];
    const delta = segment.end[axis] - origin;
    const min = axis === 'x' ? rectangle.minX : rectangle.minY;
    const max = axis === 'x' ? rectangle.maxX : rectangle.maxY;
    if (Math.abs(delta) <= numericTolerance) {
      if (origin <= min || origin >= max) return null;
    } else {
      const a = (min - origin) / delta;
      const b = (max - origin) / delta;
      start = Math.max(start, Math.min(a, b));
      end = Math.min(end, Math.max(a, b));
      if (end <= start) return null;
    }
  }
  return [start, end];
}

function segmentContact(a: Segment, b: Segment): SegmentContact | null {
  const r = subtract(a.end, a.start);
  const s = subtract(b.end, b.start);
  const delta = subtract(b.start, a.start);
  const determinant = cross(r, s);
  const projection = (point: LayoutPoint) => {
    const vector = subtract(point, a.start);
    return (vector.x * r.x + vector.y * r.y) / a.length;
  };
  const bStart = projection(b.start);
  const bEnd = projection(b.end);
  const start = Math.max(0, Math.min(bStart, bEnd));
  const end = Math.min(a.length, Math.max(bStart, bEnd));
  const distanceToB = (offset: number) =>
    Math.abs(cross(subtract(interpolate(a, offset / a.length), b.start), s)) / b.length;
  // SVG length sampling adds tiny coordinate noise to otherwise identical
  // straight runs. Require proximity along their whole shared projection, not
  // merely a small angle: long, shallow crossings must remain crossings.
  if (
    end - start > numericTolerance &&
    distanceToB(start) <= layoutGeometryTolerance &&
    distanceToB(end) <= layoutGeometryTolerance
  ) {
    const bOffset = (offset: number) => b.offset + ((offset - bStart) / (bEnd - bStart)) * b.length;
    return {
      kind: 'overlap',
      startA: a.offset + start,
      endA: a.offset + end,
      startB: bOffset(start),
      endB: bOffset(end),
    };
  }
  if (Math.abs(determinant) <= numericTolerance * a.length * b.length) return null;
  const t = cross(delta, s) / determinant;
  const u = cross(delta, r) / determinant;
  if (t < -numericTolerance || t > 1 + numericTolerance) return null;
  if (u < -numericTolerance || u > 1 + numericTolerance) return null;
  return {
    kind: 'crossing',
    point: interpolate(a, Math.max(0, Math.min(1, t))),
    aOffset: a.offset + t * a.length,
    bOffset: b.offset + u * b.length,
  };
}

function pointAtOffset(edge: PreparedEdge, offset: number): LayoutPoint {
  const segment =
    edge.segments.find((candidate) => candidate.offset + candidate.length >= offset) ??
    edge.segments[edge.segments.length - 1];
  return interpolate(segment, (offset - segment.offset) / segment.length);
}

function isTransverseCrossing(
  a: PreparedEdge,
  b: PreparedEdge,
  aOffset: number,
  bOffset: number,
  point: LayoutPoint,
) {
  const rays: { edge: number; angle: number }[] = [];
  for (const [index, edge, offset] of [
    [0, a, aOffset],
    [1, b, bOffset],
  ] as const) {
    // Both routes must continue through the contact. An endpoint or a corner
    // that only touches the other route is not a transverse crossing.
    if (offset <= numericTolerance || edge.length - offset <= numericTolerance) return false;
    const step = Math.min(layoutGeometryTolerance, offset / 2, (edge.length - offset) / 2);
    for (const direction of [-1, 1]) {
      const neighbor = pointAtOffset(edge, offset + direction * step);
      rays.push({ edge: index, angle: Math.atan2(neighbor.y - point.y, neighbor.x - point.x) });
    }
  }
  rays.sort((left, right) => left.angle - right.angle);
  return rays.every((ray, index) => {
    const next = rays[(index + 1) % rays.length];
    const angle = (next.angle - ray.angle + Math.PI * 2) % (Math.PI * 2);
    return ray.edge !== next.edge && angle > numericTolerance;
  });
}

function findSharedRuns(a: PreparedEdge, b: PreparedEdge): SharedRun[] {
  if (a.segments.length === 0 || b.segments.length === 0) return [];
  const runs: SharedRun[] = [];
  for (const aEnd of [false, true]) {
    for (const bEnd of [false, true]) {
      if ((aEnd ? a.target : a.source) !== (bEnd ? b.target : b.source)) continue;
      const aOffset = aEnd ? a.length : 0;
      const bOffset = bEnd ? b.length : 0;
      if (
        distance(pointAtOffset(a, aOffset), pointAtOffset(b, bOffset)) > layoutGeometryTolerance
      ) {
        continue;
      }
      const aBreaks = aEnd
        ? a.segments.map((segment) => a.length - segment.offset).reverse()
        : a.segments.map((segment) => segment.offset + segment.length);
      const bBreaks = bEnd
        ? b.segments.map((segment) => b.length - segment.offset).reverse()
        : b.segments.map((segment) => segment.offset + segment.length);
      let length = 0;
      for (const offset of [...new Set([...aBreaks, ...bBreaks])].sort(
        (left, right) => left - right,
      )) {
        if (offset > Math.min(a.length, b.length)) break;
        const aPoint = pointAtOffset(a, aEnd ? a.length - offset : offset);
        const bPoint = pointAtOffset(b, bEnd ? b.length - offset : offset);
        if (distance(aPoint, bPoint) > layoutGeometryTolerance) break;
        length = offset;
      }
      runs.push({ aEnd, bEnd, length });
    }
  }
  return runs;
}

function isWithinSharedRun(
  run: SharedRun,
  a: PreparedEdge,
  b: PreparedEdge,
  aOffset: number,
  bOffset: number,
) {
  return (
    (run.aEnd ? a.length - aOffset : aOffset) <= run.length + layoutGeometryTolerance &&
    (run.bEnd ? b.length - bOffset : bOffset) <= run.length + layoutGeometryTolerance
  );
}
