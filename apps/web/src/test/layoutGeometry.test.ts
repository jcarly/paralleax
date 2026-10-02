import { describe, expect, it } from 'vitest';
import {
  analyzeLayoutGeometry,
  layoutEndpointStubAllowance,
  layoutGeometryTolerance,
  type LayoutEdgePath,
  type LayoutNodeBounds,
} from './layoutGeometry';

function edge(
  id: string,
  coordinates: [number, number][],
  source = `${id}-source`,
  target = `${id}-target`,
): LayoutEdgePath {
  return { id, source, target, points: coordinates.map(([x, y]) => ({ x, y })) };
}

function subdividePath(path: LayoutEdgePath, subdivisions: number): LayoutEdgePath {
  return {
    ...path,
    points: path.points.flatMap((point, index) => {
      const next = path.points[index + 1];
      if (!next) return [point];
      return Array.from({ length: subdivisions }, (_, part) => ({
        x: point.x + ((next.x - point.x) * part) / subdivisions,
        y: point.y + ((next.y - point.y) * part) / subdivisions,
      }));
    }),
  };
}

const node: LayoutNodeBounds = { id: 'node', x: 0, y: 0, width: 100, height: 80 };

describe('rendered layout geometry audit', () => {
  it('distinguishes overlapping nodes from borders that only touch', () => {
    const report = analyzeLayoutGeometry(
      [node, { ...node, id: 'touching', x: 100 }, { ...node, id: 'inside', x: 25, y: 25 }],
      [],
    );
    expect(report.nodeOverlaps).toEqual([
      { nodeA: 'node', nodeB: 'inside' },
      { nodeA: 'touching', nodeB: 'inside' },
    ]);
  });

  it('detects axis-aligned and diagonal paths through nodes, once per edge/node', () => {
    const report = analyzeLayoutGeometry(
      [node],
      [
        edge('horizontal', [
          [-20, 40],
          [120, 40],
          [-20, 45],
        ]),
        edge('diagonal', [
          [-20, -20],
          [120, 120],
        ]),
        edge('boundary', [
          [-20, 0],
          [120, 0],
        ]),
        edge('corner', [
          [-20, 20],
          [20, -20],
        ]),
      ],
    );
    expect(report.edgeNodeIntersections).toEqual([
      { edgeId: 'horizontal', nodeId: 'node' },
      { edgeId: 'diagonal', nodeId: 'node' },
    ]);
  });

  it('detects node intersections independently of sampled segment length', () => {
    const nodes = [{ ...node, width: 2, height: 2 }];
    for (const path of [
      edge('horizontal', [
        [-1, 1],
        [3, 1],
      ]),
      edge('diagonal', [
        [-1, -1],
        [3, 3],
      ]),
    ]) {
      const coarse = analyzeLayoutGeometry(nodes, [path]);
      expect(coarse.edgeNodeIntersections).toEqual([{ edgeId: path.id, nodeId: node.id }]);
      expect(analyzeLayoutGeometry(nodes, [subdividePath(path, 80)])).toEqual(coarse);
    }
  });

  it('does not combine separate sub-tolerance node contacts into an intersection', () => {
    const path = edge('corner-visits', [
      [0.3, 0],
      [0.3, 0.35],
      [0, 0.35],
      [0, 0],
      [0.3, 0],
      [0.3, 0.35],
      [0, 0.35],
    ]);
    for (const sampled of [path, subdividePath(path, 10)]) {
      expect(analyzeLayoutGeometry([node], [sampled]).edgeNodeIntersections).toEqual([]);
    }
  });

  it('ignores small port stubs but detects routes crossing back through their own node', () => {
    const report = analyzeLayoutGeometry(
      [node],
      [
        edge(
          'leaves',
          [
            [50, 80 - layoutEndpointStubAllowance / 2],
            [50, 120],
          ],
          'node',
        ),
        edge(
          'arrives',
          [
            [50, -30],
            [50, layoutEndpointStubAllowance / 2],
          ],
          'other',
          'node',
        ),
        edge(
          'reenters',
          [
            [50, 80],
            [50, 120],
            [-20, 120],
            [-20, 40],
            [120, 40],
          ],
          'node',
        ),
        edge(
          'wrong-direction',
          [
            [50, 80],
            [50, -30],
          ],
          'node',
        ),
        edge(
          'self-loop',
          [
            [50, 80],
            [50, 120],
            [-20, 120],
            [-20, 40],
            [120, 40],
            [50, 0],
          ],
          'node',
          'node',
        ),
      ],
    );
    expect(report.edgeNodeIntersections).toEqual([
      { edgeId: 'reenters', nodeId: 'node' },
      { edgeId: 'wrong-direction', nodeId: 'node' },
      { edgeId: 'self-loop', nodeId: 'node' },
    ]);
  });

  it('detects a two-interaction cycle returning through both its source and top-input target', () => {
    const nodes = [
      { ...node, id: 'interaction-a' },
      { ...node, id: 'interaction-b', y: 200 },
    ];
    const routes = [
      edge(
        'forward',
        [
          [50, 80],
          [50, 200],
        ],
        'interaction-a',
        'interaction-b',
      ),
      // The return starts at B's bottom output and reaches A's top input by
      // crossing both cards. Endpoint stub allowances must not hide either.
      edge(
        'return',
        [
          [50, 280],
          [50, 0],
        ],
        'interaction-b',
        'interaction-a',
      ),
    ];
    for (const subdivisions of [1, 80]) {
      const report = analyzeLayoutGeometry(
        nodes,
        routes.map((route) => subdividePath(route, subdivisions)),
      );
      expect(report.edgeNodeIntersections).toEqual([
        { edgeId: 'return', nodeId: 'interaction-a' },
        { edgeId: 'return', nodeId: 'interaction-b' },
      ]);
    }
  });

  it('accepts a two-interaction cycle detouring outside both cards to the top input', () => {
    const nodes = [
      { ...node, id: 'interaction-a' },
      { ...node, id: 'interaction-b', y: 200 },
    ];
    const routes = [
      edge(
        'forward',
        [
          [50, 80],
          [50, 200],
        ],
        'interaction-a',
        'interaction-b',
      ),
      edge(
        'return',
        [
          [50, 280],
          [50, 320],
          [140, 320],
          [140, -40],
          [50, -40],
          [50, 0],
        ],
        'interaction-b',
        'interaction-a',
      ),
    ];
    for (const subdivisions of [1, 80]) {
      expect(
        analyzeLayoutGeometry(
          nodes,
          routes.map((route) => subdividePath(route, subdivisions)),
        ),
      ).toEqual({
        nodeOverlaps: [],
        edgeNodeIntersections: [],
        edgeCrossings: [],
        edgeOverlaps: [],
      });
    }
  });

  it('detects transverse intersections at sampled vertices without counting them twice', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge('horizontal', [
          [0, 50],
          [50, 50],
          [100, 50],
        ]),
        edge('vertical', [
          [50, 0],
          [50, 50],
          [50, 100],
        ]),
      ],
    );
    expect(report.edgeCrossings).toEqual([
      { edgeA: 'horizontal', edgeB: 'vertical', point: { x: 50, y: 50 } },
    ]);
  });

  it('detects diagonal crossings and retains separate intersections for the same pair', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge('diagonal', [
          [0, 0],
          [100, 100],
        ]),
        edge('zigzag', [
          [0, 80],
          [80, 0],
          [80, 100],
        ]),
      ],
    );
    expect(report.edgeCrossings).toEqual([
      { edgeA: 'diagonal', edgeB: 'zigzag', point: { x: 40, y: 40 } },
      { edgeA: 'diagonal', edgeB: 'zigzag', point: { x: 80, y: 80 } },
    ]);
  });

  it('does not count tangent corners or endpoint-only contacts as transverse crossings', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge('horizontal', [
          [0, 50],
          [100, 50],
        ]),
        edge('tangent', [
          [20, 0],
          [50, 50],
          [80, 0],
        ]),
        edge('endpoint', [
          [90, 0],
          [90, 50],
        ]),
      ],
    );
    expect(report.edgeCrossings).toEqual([]);
  });

  it('exempts contiguous shared source stems even with different sampling densities', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge(
          'left',
          [
            [0, 0],
            [0, 100],
            [0, 400],
            [-100, 400],
          ],
          'source',
        ),
        edge(
          'right',
          [
            [0, 0],
            [0, 50],
            [0, 200],
            [0, 400],
            [100, 400],
          ],
          'source',
        ),
      ],
    );
    expect(report.edgeCrossings).toEqual([]);
    expect(report.edgeOverlaps).toEqual([]);
  });

  it('exempts shared target stems and a legitimate source-to-target junction', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge(
          'left',
          [
            [-100, 0],
            [0, 0],
            [0, 400],
          ],
          'a',
          'shared',
        ),
        edge(
          'right',
          [
            [100, 0],
            [0, 0],
            [0, 100],
            [0, 400],
          ],
          'b',
          'shared',
        ),
        edge(
          'outgoing',
          [
            [0, 400],
            [0, 500],
          ],
          'shared',
          'c',
        ),
      ],
    );
    expect(report.edgeCrossings).toEqual([]);
    expect(report.edgeOverlaps).toEqual([]);
  });

  it('counts crossings between shared-source paths after they diverge', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge(
          'left',
          [
            [0, 0],
            [0, 100],
            [-100, 100],
            [100, 300],
          ],
          'source',
        ),
        edge(
          'right',
          [
            [0, 0],
            [0, 100],
            [100, 100],
            [-100, 300],
          ],
          'source',
        ),
      ],
    );
    expect(report.edgeCrossings).toEqual([
      { edgeA: 'left', edgeB: 'right', point: { x: 0, y: 200 } },
    ]);
    expect(report.edgeOverlaps).toEqual([]);
  });

  it('reports later shared-source collinear runs instead of exempting the complete pair', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge(
          'left',
          [
            [0, 0],
            [-100, 100],
            [100, 100],
            [100, 200],
          ],
          'source',
        ),
        edge(
          'right',
          [
            [0, 0],
            [0, 50],
            [-100, 100],
            [0, 100],
            [100, 100],
            [200, 200],
          ],
          'source',
        ),
      ],
    );
    expect(report.edgeOverlaps).toEqual([{ edgeA: 'left', edgeB: 'right' }]);
  });

  it('counts collinear overlaps once per pair, including opposite directions', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge('a', [
          [0, 0],
          [50, 50],
          [100, 100],
        ]),
        edge('b', [
          [150, 150],
          [75, 75],
          [25, 25],
        ]),
      ],
    );
    expect(report.edgeOverlaps).toEqual([{ edgeA: 'a', edgeB: 'b' }]);
    expect(report.edgeCrossings).toEqual([]);
  });

  it('detects overlapping routes independently of either sampling density or direction', () => {
    const first = edge('a', [
      [0, 0],
      [4, 4],
    ]);
    for (const second of [
      edge('b', [
        [1, 1],
        [3, 3],
      ]),
      edge('b', [
        [3, 3],
        [1, 1],
      ]),
    ]) {
      const coarse = analyzeLayoutGeometry([], [first, second]);
      expect(coarse.edgeOverlaps).toEqual([{ edgeA: 'a', edgeB: 'b' }]);
      expect(
        analyzeLayoutGeometry([], [subdividePath(first, 80), subdividePath(second, 60)]),
      ).toEqual(coarse);
      expect(analyzeLayoutGeometry([], [first, subdividePath(second, 60)])).toEqual(coarse);
    }
  });

  it('classifies nearly coincident SVG routes as overlaps despite coordinate noise', () => {
    const first = edge('a', [
      [0, 0],
      [0.001, 10000],
    ]);
    for (const second of [
      edge('b', [
        [0.001, 0],
        [0, 10000],
      ]),
      edge('b', [
        [0, 10000],
        [0.001, 0],
      ]),
    ]) {
      const report = analyzeLayoutGeometry([], [first, second]);
      expect(report.edgeCrossings).toEqual([]);
      expect(report.edgeOverlaps).toEqual([{ edgeA: 'a', edgeB: 'b' }]);
      expect(
        analyzeLayoutGeometry([], [subdividePath(first, 80), subdividePath(second, 60)]),
      ).toEqual(report);
    }
  });

  it('distinguishes short near-perpendicular crossings from coincident routes', () => {
    const first = edge('long', [
      [0, 0],
      [1000, 0],
    ]);
    const second = edge('short', [
      [500, -1],
      [500.3, 1.2],
    ]);
    for (const routes of [
      [first, second],
      [second, first],
      [subdividePath(first, 80), subdividePath(second, 60)],
    ]) {
      const report = analyzeLayoutGeometry([], routes);
      expect(report.edgeCrossings).toHaveLength(1);
      expect(report.edgeCrossings[0].point.x).toBeCloseTo(500 + 0.3 / 2.2);
      expect(report.edgeCrossings[0].point.y).toBeCloseTo(0);
      expect(report.edgeOverlaps).toEqual([]);
    }
  });

  it('retains genuine shallow crossings that diverge beyond the geometric tolerance', () => {
    const first = edge('a', [
      [0, -10000],
      [0, 10000],
    ]);
    const second = edge('b', [
      [-5, -10000],
      [5, 10000],
    ]);
    const report = analyzeLayoutGeometry([], [first, second]);
    expect(report.edgeCrossings).toEqual([{ edgeA: 'a', edgeB: 'b', point: { x: 0, y: 0 } }]);
    expect(report.edgeOverlaps).toEqual([]);
    expect(
      analyzeLayoutGeometry([], [subdividePath(first, 80), subdividePath(second, 80)]),
    ).toEqual(report);
  });

  it('does not combine separate sub-tolerance overlaps into one significant overlap', () => {
    const first = edge('a', [
      [0, 0],
      [2, 0],
    ]);
    const second = edge('b', [
      [0.2, 0],
      [0.4, 0],
      [0.4, 1],
      [1.2, 1],
      [1.2, 0],
      [1.4, 0],
    ]);
    expect(analyzeLayoutGeometry([], [first, second]).edgeOverlaps).toEqual([]);
    expect(
      analyzeLayoutGeometry([], [subdividePath(first, 40), subdividePath(second, 10)]).edgeOverlaps,
    ).toEqual([]);
  });

  it('keeps densely sampled common stems exempt from overlap reports', () => {
    const first = edge(
      'left',
      [
        [0, 0],
        [0, 4],
        [-2, 4],
      ],
      'shared',
    );
    const second = edge(
      'right',
      [
        [0, 0],
        [0, 4],
        [2, 4],
      ],
      'shared',
    );
    const coarse = analyzeLayoutGeometry([], [first, second]);
    expect(coarse.edgeOverlaps).toEqual([]);
    expect(
      analyzeLayoutGeometry([], [subdividePath(first, 80), subdividePath(second, 60)]),
    ).toEqual(coarse);
  });

  it('does not exempt visually identical routes between different graph endpoints', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge('a', [
          [0, 0],
          [100, 100],
        ]),
        edge('b', [
          [0, 0],
          [100, 100],
        ]),
      ],
    );
    expect(report.edgeOverlaps).toEqual([{ edgeA: 'a', edgeB: 'b' }]);
  });

  it('does not exempt paths merely because they start at different ports on the same node', () => {
    const report = analyzeLayoutGeometry(
      [],
      [
        edge(
          'a',
          [
            [0, 0],
            [0, 100],
            [100, 100],
          ],
          'shared-node',
        ),
        edge(
          'b',
          [
            [10, 0],
            [0, 50],
            [0, 100],
            [100, 100],
          ],
          'shared-node',
        ),
      ],
    );
    expect(report.edgeOverlaps).toEqual([{ edgeA: 'a', edgeB: 'b' }]);
  });

  it('uses explicit graph-space tolerance and handles repeated or empty samples', () => {
    const report = analyzeLayoutGeometry(
      [node, { ...node, id: 'almost-touching', x: 100 - layoutGeometryTolerance / 2 }],
      [
        edge('empty', []),
        edge('point', [
          [0, 0],
          [0, 0],
        ]),
        edge('outside', [
          [-20, -1],
          [120, -1],
        ]),
        edge('border-rounding', [
          [-20, layoutGeometryTolerance / 2],
          [120, layoutGeometryTolerance / 2],
        ]),
      ],
    );
    expect(report).toEqual({
      nodeOverlaps: [],
      edgeNodeIntersections: [],
      edgeCrossings: [],
      edgeOverlaps: [],
    });
  });
});
