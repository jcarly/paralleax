import type { Story } from '@paralleax/shared';
import { describe, expect, it } from 'vitest';
import { buildInteractionNodes, buildTriggerEdges, buildTriggerNodes } from './storyGraph';

describe('large story graph projection', () => {
  it('projects 2,000 linked interactions within the editor budget', () => {
    const story = graphStory(2_000);
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
});

function graphStory(interactionCount: number): Story {
  const now = new Date().toISOString();
  return {
    id: 'large-graph-story',
    title: 'Large graph story',
    createdAt: now,
    updatedAt: now,
    interactions: Array.from({ length: interactionCount }, (_, index) => ({
      id: `interaction-${index}`,
      title: `Interaction ${index}`,
      body: `Body ${index}`,
      position: { x: (index % 25) * 240, y: Math.floor(index / 25) * 130 },
      triggers:
        index === 0
          ? [{ id: 'trigger-0', inputInteractionIds: [], conditions: [] }]
          : [
              {
                id: `trigger-${index}`,
                inputInteractionIds: [`interaction-${index - 1}`],
                conditions:
                  index % 10 === 0
                    ? [
                        {
                          interactionId: `interaction-${index - 1}`,
                          hasBeenVisited: true,
                        },
                      ]
                    : [],
              },
            ],
    })),
  };
}
