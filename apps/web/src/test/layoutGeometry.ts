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

interface EdgeContactAnalysis {
  edge: PreparedEdge;
  other: PreparedEdge;
  sharedRuns: SharedRun[];
  crossings: LayoutPoint[];
  overlapIntervals: [number, number][];
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

  findNodeOverlaps(preparedNodes, report);
  findEdgeNodeIntersections(preparedEdges, preparedNodes, report);
  findEdgeContacts(preparedEdges, report);
  return report;
}

function findNodeOverlaps(nodes: (LayoutNodeBounds & Bounds)[], report: LayoutGeometryReport) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    for (const other of nodes.slice(index + 1)) {
      if (nodesOverlap(node, other)) {
        report.nodeOverlaps.push({ nodeA: node.id, nodeB: other.id });
      }
    }
  }
}

function nodesOverlap(a: LayoutNodeBounds & Bounds, b: LayoutNodeBounds & Bounds) {
  return (
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > layoutGeometryTolerance &&
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > layoutGeometryTolerance
  );
}

function findEdgeNodeIntersections(
  edges: PreparedEdge[],
  nodes: (LayoutNodeBounds & Bounds)[],
  report: LayoutGeometryReport,
) {
  for (const edge of edges) {
    for (const node of nodes) {
      if (edgeIntersectsNode(edge, node)) {
        report.edgeNodeIntersections.push({ edgeId: edge.id, nodeId: node.id });
      }
    }
  }
}

function edgeIntersectsNode(edge: PreparedEdge, node: LayoutNodeBounds & Bounds) {
  if (!boundsTouch(edge.bounds, node)) {
    return false;
  }
  const inner = {
    minX: node.minX + layoutGeometryTolerance,
    minY: node.minY + layoutGeometryTolerance,
    maxX: node.maxX - layoutGeometryTolerance,
    maxY: node.maxY - layoutGeometryTolerance,
  };
  if (inner.minX >= inner.maxX || inner.minY >= inner.maxY) {
    return false;
  }
  const allowedStart = edge.source === node.id ? layoutEndpointStubAllowance : 0;
  const allowedEnd = edge.length - (edge.target === node.id ? layoutEndpointStubAllowance : 0);
  const intervals = edge.segments.flatMap((segment) =>
    segmentNodeInteriorInterval(segment, inner, allowedStart, allowedEnd),
  );
  return hasSignificantContinuousInterval(intervals);
}

function segmentNodeInteriorInterval(
  segment: Segment,
  inner: Bounds,
  allowedStart: number,
  allowedEnd: number,
): [number, number][] {
  if (!boundsTouch(segment, inner)) {
    return [];
  }
  const interval = rectangleInterval(segment, inner);
  if (!interval) {
    return [];
  }
  const start = Math.max(segment.offset + interval[0] * segment.length, allowedStart);
  const end = Math.min(segment.offset + interval[1] * segment.length, allowedEnd);
  return end - start > numericTolerance ? [[start, end]] : [];
}

function findEdgeContacts(edges: PreparedEdge[], report: LayoutGeometryReport) {
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    for (const other of edges.slice(index + 1)) {
      reportEdgePairContacts(edge, other, report);
    }
  }
}

function reportEdgePairContacts(
  edge: PreparedEdge,
  other: PreparedEdge,
  report: LayoutGeometryReport,
) {
  if (!boundsTouch(edge.bounds, other.bounds)) {
    return;
  }
  const sharedRuns = findSharedRuns(edge, other);
  const analysis: EdgeContactAnalysis = {
    edge,
    other,
    sharedRuns,
    crossings: [],
    overlapIntervals: [],
  };
  for (const segment of edge.segments) {
    collectSegmentContacts(segment, analysis);
  }
  report.edgeCrossings.push(
    ...analysis.crossings.map((point) => ({ edgeA: edge.id, edgeB: other.id, point })),
  );
  if (hasSignificantContinuousInterval(analysis.overlapIntervals)) {
    report.edgeOverlaps.push({ edgeA: edge.id, edgeB: other.id });
  }
}

function collectSegmentContacts(segment: Segment, analysis: EdgeContactAnalysis) {
  if (!boundsTouch(segment, analysis.other.bounds)) {
    return;
  }
  for (const otherSegment of analysis.other.segments) {
    analyzeSegmentContact(segment, otherSegment, analysis);
  }
}

function analyzeSegmentContact(
  segment: Segment,
  otherSegment: Segment,
  analysis: EdgeContactAnalysis,
) {
  if (!boundsTouch(segment, otherSegment)) {
    return;
  }
  const contact = segmentContact(segment, otherSegment);
  if (!contact) {
    return;
  }
  if (contact.kind === 'overlap') {
    recordOverlapContact(contact, analysis);
    return;
  }
  recordCrossingContact(contact, analysis);
}

function recordOverlapContact(
  contact: Extract<SegmentContact, { kind: 'overlap' }>,
  analysis: EdgeContactAnalysis,
) {
  const start = [contact.startA, contact.startB] as const;
  const end = [contact.endA, contact.endB] as const;
  const exempt = analysis.sharedRuns.some(
    (run) =>
      isWithinSharedRun(run, analysis.edge, analysis.other, start) &&
      isWithinSharedRun(run, analysis.edge, analysis.other, end),
  );
  if (!exempt) {
    analysis.overlapIntervals.push([contact.startA, contact.endA]);
  }
}

function recordCrossingContact(
  contact: Extract<SegmentContact, { kind: 'crossing' }>,
  analysis: EdgeContactAnalysis,
) {
  const offsets = [contact.aOffset, contact.bOffset] as const;
  const isShared = analysis.sharedRuns.some((run) =>
    isWithinSharedRun(run, analysis.edge, analysis.other, offsets),
  );
  if (isShared || hasDuplicateCrossing(analysis.crossings, contact.point)) {
    return;
  }
  if (isTransverseCrossing(analysis.edge, analysis.other, contact)) {
    analysis.crossings.push(contact.point);
  }
}

function hasDuplicateCrossing(crossings: LayoutPoint[], point: LayoutPoint) {
  return crossings.some((candidate) => distance(candidate, point) <= layoutGeometryTolerance);
}

function prepareEdge(edge: LayoutEdgePath): PreparedEdge {
  const segments: Segment[] = [];
  let length = 0;
  for (let index = 1; index < edge.points.length; index += 1) {
    const start = edge.points[index - 1];
    const end = edge.points[index];
    const segmentLength = distance(start, end);
    if (segmentLength <= numericTolerance) {
      continue;
    }
    const previous = segments[segments.length - 1];
    if (previous && continuesStraightSegment(previous, start, end, segmentLength)) {
      extendSegment(previous, end);
      length = previous.offset + previous.length;
      continue;
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

function continuesStraightSegment(
  previous: Segment,
  start: LayoutPoint,
  end: LayoutPoint,
  length: number,
) {
  const before = subtract(previous.end, previous.start);
  const after = subtract(end, start);
  // Sampling a straight run more densely must not shorten the portion used
  // to distinguish a genuine shallow crossing from SVG coordinate noise.
  return (
    Math.abs(cross(before, after)) <= numericTolerance * previous.length * length &&
    before.x * after.x + before.y * after.y > 0
  );
}

function extendSegment(segment: Segment, end: LayoutPoint) {
  segment.end = end;
  segment.length = distance(segment.start, end);
  segment.minX = Math.min(segment.start.x, end.x);
  segment.minY = Math.min(segment.start.y, end.y);
  segment.maxX = Math.max(segment.start.x, end.x);
  segment.maxY = Math.max(segment.start.y, end.y);
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
    if (runEnd - runStart > layoutGeometryTolerance) {
      return true;
    }
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
  let interval: [number, number] = [0, 1];
  for (const axis of ['x', 'y'] as const) {
    const clipped = clipRectangleAxis(segment, rectangle, axis, interval);
    if (!clipped) {
      return null;
    }
    interval = clipped;
  }
  return interval;
}

function clipRectangleAxis(
  segment: Segment,
  rectangle: Bounds,
  axis: 'x' | 'y',
  interval: [number, number],
): [number, number] | null {
  const origin = segment.start[axis];
  const delta = segment.end[axis] - origin;
  const min = axis === 'x' ? rectangle.minX : rectangle.minY;
  const max = axis === 'x' ? rectangle.maxX : rectangle.maxY;
  if (Math.abs(delta) <= numericTolerance) {
    return origin <= min || origin >= max ? null : interval;
  }
  const a = (min - origin) / delta;
  const b = (max - origin) / delta;
  const start = Math.max(interval[0], Math.min(a, b));
  const end = Math.min(interval[1], Math.max(a, b));
  return end <= start ? null : [start, end];
}

function segmentContact(a: Segment, b: Segment): SegmentContact | null {
  const r = subtract(a.end, a.start);
  const s = subtract(b.end, b.start);
  const overlap = findSegmentOverlap(a, b, r, s);
  if (overlap) {
    return overlap;
  }
  const delta = subtract(b.start, a.start);
  const determinant = cross(r, s);
  if (Math.abs(determinant) <= numericTolerance * a.length * b.length) {
    return null;
  }
  const t = cross(delta, s) / determinant;
  const u = cross(delta, r) / determinant;
  if (t < -numericTolerance || t > 1 + numericTolerance) {
    return null;
  }
  if (u < -numericTolerance || u > 1 + numericTolerance) {
    return null;
  }
  return {
    kind: 'crossing',
    point: interpolate(a, Math.max(0, Math.min(1, t))),
    aOffset: a.offset + t * a.length,
    bOffset: b.offset + u * b.length,
  };
}

function findSegmentOverlap(
  a: Segment,
  b: Segment,
  r: LayoutPoint,
  s: LayoutPoint,
): Extract<SegmentContact, { kind: 'overlap' }> | null {
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
  const distanceToA = (offset: number) => {
    const point = interpolate(b, (offset - bStart) / (bEnd - bStart));
    return Math.abs(cross(subtract(point, a.start), r)) / a.length;
  };
  // SVG length sampling adds tiny coordinate noise to otherwise identical
  // straight runs. Require proximity along their whole shared projection, not
  // merely a small angle: long, shallow crossings must remain crossings.
  if (
    end - start > numericTolerance &&
    distanceToB(start) <= layoutGeometryTolerance &&
    distanceToB(end) <= layoutGeometryTolerance &&
    // Both projected portions must be close: a near-perpendicular short segment
    // has a tiny projection onto a long route but still crosses that route.
    distanceToA(start) <= layoutGeometryTolerance &&
    distanceToA(end) <= layoutGeometryTolerance
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
  return null;
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
  contact: Extract<SegmentContact, { kind: 'crossing' }>,
) {
  const { aOffset, bOffset, point } = contact;
  const rays: { edge: number; angle: number }[] = [];
  for (const [index, edge, offset] of [
    [0, a, aOffset],
    [1, b, bOffset],
  ] as const) {
    // Both routes must continue through the contact. An endpoint or a corner
    // that only touches the other route is not a transverse crossing.
    if (offset <= numericTolerance || edge.length - offset <= numericTolerance) {
      return false;
    }
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
  if (a.segments.length === 0 || b.segments.length === 0) {
    return [];
  }
  const runs: SharedRun[] = [];
  for (const aEnd of [false, true]) {
    for (const bEnd of [false, true]) {
      const run = findSharedRun(a, b, aEnd, bEnd);
      if (run) {
        runs.push(run);
      }
    }
  }
  return runs;
}

function findSharedRun(a: PreparedEdge, b: PreparedEdge, aEnd: boolean, bEnd: boolean) {
  if ((aEnd ? a.target : a.source) !== (bEnd ? b.target : b.source)) {
    return null;
  }
  const aOffset = aEnd ? a.length : 0;
  const bOffset = bEnd ? b.length : 0;
  if (distance(pointAtOffset(a, aOffset), pointAtOffset(b, bOffset)) > layoutGeometryTolerance) {
    return null;
  }
  return { aEnd, bEnd, length: sharedRunLength(a, b, aEnd, bEnd) };
}

function sharedRunLength(a: PreparedEdge, b: PreparedEdge, aEnd: boolean, bEnd: boolean) {
  const offsets = [...new Set([...sharedRunBreaks(a, aEnd), ...sharedRunBreaks(b, bEnd)])].sort(
    (left, right) => left - right,
  );
  const maxLength = Math.min(a.length, b.length);
  let length = 0;
  for (const offset of offsets) {
    if (offset > maxLength) {
      break;
    }
    const aPoint = pointAtOffset(a, aEnd ? a.length - offset : offset);
    const bPoint = pointAtOffset(b, bEnd ? b.length - offset : offset);
    if (distance(aPoint, bPoint) > layoutGeometryTolerance) {
      break;
    }
    length = offset;
  }
  return length;
}

function sharedRunBreaks(edge: PreparedEdge, atEnd: boolean) {
  return atEnd
    ? edge.segments.map((segment) => edge.length - segment.offset).reverse()
    : edge.segments.map((segment) => segment.offset + segment.length);
}

function isWithinSharedRun(
  run: SharedRun,
  a: PreparedEdge,
  b: PreparedEdge,
  offsets: readonly [number, number],
) {
  const [aOffset, bOffset] = offsets;
  return (
    (run.aEnd ? a.length - aOffset : aOffset) <= run.length + layoutGeometryTolerance &&
    (run.bEnd ? b.length - bOffset : bOffset) <= run.length + layoutGeometryTolerance
  );
}
