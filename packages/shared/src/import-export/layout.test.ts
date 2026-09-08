import { describe, expect, it } from 'vitest';
import { layoutImportedGraph } from './layout.js';

describe('imported graph layout', () => {
  it('wraps wide root layers into bounded deterministic rows', () => {
    const nodes = Array.from({ length: 18 }, (_, index) => ({ key: `node-${index}` }));
    const positions = layoutImportedGraph(nodes, []);

    expect(positions.get('node-0')).toEqual({ x: 80, y: 120 });
    expect(positions.get('node-7')).toEqual({ x: 2_320, y: 120 });
    expect(positions.get('node-8')).toEqual({ x: 80, y: 340 });
    expect(positions.get('node-16')).toEqual({ x: 80, y: 560 });
  });

  it('keeps cyclic fallback nodes together instead of creating one row per node', () => {
    const nodes = Array.from({ length: 10 }, (_, index) => ({ key: `node-${index}` }));
    const edges = nodes.map(({ key }, index) => ({
      from: key,
      to: nodes[(index + 1) % nodes.length].key,
    }));
    const positions = layoutImportedGraph(nodes, edges);

    expect(positions.get('node-0')).toEqual({ x: 80, y: 120 });
    expect(positions.get('node-8')).toEqual({ x: 80, y: 340 });
  });
});
