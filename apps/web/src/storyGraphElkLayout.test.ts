import type { Story } from '@paralleax/shared';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interactionNodeHeight, interactionNodeWidth } from './storyGraph';
import { computeStoryGraphElkLayout, preloadStoryGraphElk } from './storyGraphElkLayout';

const { constructElk, layout } = vi.hoisted(() => ({
  constructElk: vi.fn(),
  layout: vi.fn<(graph: ElkNode) => Promise<ElkNode>>(),
}));

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class {
    constructor() {
      constructElk();
    }

    layout = layout;
  },
}));

function createLayoutStory(): Story {
  return {
    id: 'story-layout',
    title: 'Layout story',
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'start', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'other',
        title: 'Other input',
        body: '',
        position: { x: 100, y: 160 },
        triggers: [{ id: 'other-start', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'target',
        title: 'Target',
        body: '',
        position: { x: 110, y: 180 },
        triggers: [
          { id: 'merge', inputInteractionIds: ['root', 'other'], conditions: [] },
          { id: 'alternative', inputInteractionIds: ['root'], conditions: [] },
        ],
      },
    ],
  };
}

describe('ELK story graph adapter', () => {
  beforeEach(() => {
    constructElk.mockClear();
    layout.mockReset();
    layout.mockResolvedValue({ id: 'root' });
  });

  it('preloads the cached ELK instance before connecting alternative triggers to their owner', async () => {
    const story = createLayoutStory();
    const original = structuredClone(story);

    await expect(preloadStoryGraphElk()).resolves.toBeUndefined();
    await computeStoryGraphElkLayout(story, {
      interactionSizes: new Map([
        ['root', { width: 240.2, height: 150.8 }],
        ['other', { width: 0, height: -1 }],
      ]),
    });

    expect(constructElk).toHaveBeenCalledOnce();
    const graph = layout.mock.calls[0][0];
    expect(graph.layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
    });
    expect(graph.children?.map(({ id }) => id)).toEqual([
      'interaction:root',
      'interaction:other',
      'interaction:target',
      'trigger:target:merge',
      'trigger:target:alternative',
    ]);
    expect(graph.children?.[0]).toEqual({
      id: 'interaction:root',
      width: 241,
      height: 151,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        {
          id: 'interaction:root:input',
          x: 120.5,
          y: 0,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': 'NORTH' },
        },
        {
          id: 'interaction:root:output',
          x: 120.5,
          y: 151,
          width: 0,
          height: 0,
          layoutOptions: { 'elk.port.side': 'SOUTH' },
        },
      ],
    });
    for (const node of graph.children!.slice(1, 3)) {
      expect(node).toMatchObject({ width: interactionNodeWidth, height: interactionNodeHeight });
    }
    expect(graph.children?.slice(3)).toEqual([
      { id: 'trigger:target:merge', width: 20, height: 20 },
      { id: 'trigger:target:alternative', width: 20, height: 20 },
    ]);
    expect(graph.edges).toEqual([
      {
        id: 'trigger:target:merge-root',
        sources: ['interaction:root:output'],
        targets: ['trigger:target:merge'],
      },
      {
        id: 'trigger:target:merge-other',
        sources: ['interaction:other:output'],
        targets: ['trigger:target:merge'],
      },
      {
        id: 'trigger:target:merge-output',
        sources: ['trigger:target:merge'],
        targets: ['interaction:target:input'],
      },
      {
        id: 'trigger:target:alternative-root',
        sources: ['interaction:root:output'],
        targets: ['trigger:target:alternative'],
      },
      {
        id: 'trigger:target:alternative-output',
        sources: ['trigger:target:alternative'],
        targets: ['interaction:target:input'],
      },
    ]);
    expect(story).toEqual(original);
  });

  it('does not send dangling input references to ELK', async () => {
    const story = createLayoutStory();
    story.interactions[2].triggers[0].inputInteractionIds.push('missing-interaction');

    await computeStoryGraphElkLayout(story);

    const graph = layout.mock.calls[0][0];
    expect(graph.edges).toHaveLength(5);
    expect(graph.edges?.flatMap((edge) => edge.sources)).not.toContain(
      'interaction:missing-interaction:output',
    );
  });

  it('translates and rounds nodes and routed edges together while preserving the story origin', async () => {
    const story = createLayoutStory();
    const original = structuredClone(story);
    layout.mockResolvedValue({
      id: 'root',
      children: [
        { id: 'interaction:root', x: 12.25, y: 23.75 },
        { id: 'interaction:other', x: 312.75, y: 23.75 },
        { id: 'interaction:target', x: 212.4, y: 423.9 },
        { id: 'trigger:target:merge', x: 102.6, y: 283.3 },
        { id: 'trigger:target:alternative', x: 307.4, y: 283.3 },
      ],
      edges: [
        {
          id: 'trigger:target:merge-root',
          sources: ['interaction:root:output'],
          targets: ['trigger:target:merge'],
          sections: [
            {
              id: 'input-route',
              startPoint: { x: 117.25, y: 139.75 },
              bendPoints: [
                { x: 117.25, y: 213.5 },
                { x: 112.6, y: 213.5 },
              ],
              endPoint: { x: 112.6, y: 283.3 },
            },
          ],
        },
        {
          id: 'trigger:target:alternative-output',
          sources: ['trigger:target:alternative'],
          targets: ['interaction:target:input'],
          sections: [
            {
              id: 'output-route',
              startPoint: { x: 317.4, y: 303.3 },
              endPoint: { x: 317.4, y: 423.9 },
            },
          ],
        },
      ],
    });

    const result = await computeStoryGraphElkLayout(story);

    expect(result.interactionUpdates).toEqual([
      { interactionId: 'other', position: { x: 381, y: 120 } },
      { interactionId: 'target', position: { x: 280, y: 520 } },
    ]);
    expect(result.triggerUpdates).toEqual([
      { interactionId: 'target', triggerIds: ['merge'], position: { x: 170, y: 380 } },
      { interactionId: 'target', triggerIds: ['alternative'], position: { x: 375, y: 380 } },
    ]);
    expect(result.affectedNodeIds).toEqual([
      'root',
      'other',
      'target',
      'trigger:target:merge',
      'trigger:target:alternative',
    ]);
    expect(result.edgeRoutes).toEqual(
      new Map([
        [
          'trigger:target:merge-root',
          [
            { x: 185, y: 236 },
            { x: 185, y: 310 },
            { x: 180, y: 310 },
            { x: 180, y: 380 },
          ],
        ],
        [
          'trigger:target:alternative-output',
          [
            { x: 385, y: 400 },
            { x: 385, y: 520 },
          ],
        ],
      ]),
    );
    expect(story).toEqual(original);
  });

  it('omits unchanged positions and incomplete results instead of inventing saved coordinates', async () => {
    const story = createLayoutStory();
    story.interactions[2].triggers[0].position = { x: 120, y: 150 };
    layout.mockResolvedValue({
      id: 'root',
      children: [
        { id: 'interaction:root', x: 10, y: 10 },
        { id: 'interaction:other', x: 30, y: 50 },
        { id: 'interaction:target', x: 40 },
        { id: 'trigger:target:merge', x: 50, y: 40 },
        { id: 'trigger:target:alternative', y: 60 },
        { id: 'unknown-node', x: -1000, y: -1000 },
      ],
      edges: [
        {
          id: 'trigger:target:merge-output',
          sources: ['trigger:target:merge'],
          targets: ['interaction:target:input'],
        },
      ],
    });

    const result = await computeStoryGraphElkLayout(story);

    expect(result.interactionUpdates).toEqual([]);
    expect(result.triggerUpdates).toEqual([]);
    expect(result.edgeRoutes).toEqual(new Map());
  });

  it('returns no updates for an empty story without invoking the layout engine', async () => {
    const story = createLayoutStory();
    story.interactions = [];

    await expect(computeStoryGraphElkLayout(story)).resolves.toEqual({
      interactionUpdates: [],
      triggerUpdates: [],
      affectedNodeIds: [],
    });
    expect(layout).not.toHaveBeenCalled();
  });

  it('returns no updates when ELK supplies no interaction geometry', async () => {
    const story = createLayoutStory();
    layout.mockResolvedValue({
      id: 'root',
      children: [{ id: 'trigger:target:merge', x: 10, y: 20 }],
    });

    await expect(computeStoryGraphElkLayout(story)).resolves.toEqual({
      interactionUpdates: [],
      triggerUpdates: [],
      affectedNodeIds: [],
    });
  });

  it('propagates an ELK failure without changing the authored story', async () => {
    const story = createLayoutStory();
    const original = structuredClone(story);
    const error = new Error('Layout failed');
    layout.mockRejectedValue(error);

    await expect(computeStoryGraphElkLayout(story)).rejects.toBe(error);

    expect(story).toEqual(original);
  });
});
