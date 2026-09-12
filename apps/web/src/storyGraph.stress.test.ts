import { describe, expect, it } from 'vitest';
import {
  applyInteractionMovesEdgePreview,
  applyInteractionMovesTriggerPreview,
  buildInteractionNodes,
  buildTriggerEdges,
  buildTriggerNodes,
  type StoryFlowNode,
} from './storyGraph';
import { computeStoryGraphLayout } from './storyGraphLayout';
import { createLargeEditorStoryFixture } from './test/largeEditorStoryFixture';

describe('large story graph projection', () => {
  it('projects 2,000 linked interactions within the editor budget', () => {
    const story = createLargeEditorStoryFixture(2_000, { columns: 25 });
    const startedAt = performance.now();
    const interactionNodes = buildInteractionNodes(story, undefined);
    const triggerNodes = buildTriggerNodes(story);
    const edges = buildTriggerEdges(story);
    const durationMs = performance.now() - startedAt;

    expect(interactionNodes).toHaveLength(2_000);
    expect(triggerNodes).toHaveLength(1_999);
    expect(edges).toHaveLength(3_998);
    expect(durationMs).toBeLessThan(5_000);
  });

  it('automatically lays out 2,000 linked interactions within the editor budget', () => {
    const story = createLargeEditorStoryFixture(2_000, { columns: 25 });
    const startedAt = performance.now();
    const layout = computeStoryGraphLayout(story, { kind: 'all' });
    const durationMs = performance.now() - startedAt;

    expect(layout.interactionUpdates.length).toBeGreaterThan(1_900);
    expect(layout.triggerUpdates).toHaveLength(1_999);
    expect(layout.affectedNodeIds).toHaveLength(3_999);
    expect(durationMs).toBeLessThan(5_000);
  });

  it('previews a sustained interaction drag within the editor frame-work budget', () => {
    const story = createLargeEditorStoryFixture(2_000, { columns: 25 });
    let nodes: StoryFlowNode[] = [
      ...buildInteractionNodes(story, undefined),
      ...buildTriggerNodes(story),
    ];
    let edges = buildTriggerEdges(story);
    const startedAt = performance.now();

    for (let frame = 0; frame < 120; frame += 1) {
      const positionOverrides = new Map([
        ['interaction-1000', { x: 240 + frame, y: 5_240 + frame }],
      ]);
      nodes = applyInteractionMovesTriggerPreview(nodes, story, positionOverrides);
      edges = applyInteractionMovesEdgePreview(edges, story, positionOverrides);
    }

    const durationMs = performance.now() - startedAt;
    console.info(
      `STORY_GRAPH_DRAG ${JSON.stringify({
        interactions: story.interactions.length,
        frames: 120,
        durationMs: Math.round(durationMs * 100) / 100,
        averageFrameMs: Math.round((durationMs / 120) * 100) / 100,
      })}`,
    );

    expect(nodes).toHaveLength(3_999);
    expect(edges).toHaveLength(3_998);
    expect(durationMs).toBeLessThan(2_000);
  });
});
