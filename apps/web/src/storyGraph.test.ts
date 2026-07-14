import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import { buildInteractionNodes, buildTriggerEdges } from './storyGraph';

const story: Story = {
  id: 'story-1',
  title: 'Graph story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'Start',
      body: 'Start body',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'interaction-2',
      title: 'Choice',
      body: 'Choice body',
      position: { x: 420, y: 160 },
      triggers: [
        {
          id: 'trigger-linked',
          inputInteractionIds: ['interaction-1', 'interaction-3'],
          conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
        },
      ],
    },
    {
      id: 'interaction-3',
      title: 'Other',
      body: 'Other body',
      position: { x: 420, y: 320 },
      triggers: [],
    },
  ],
};

describe('story graph mapping', () => {
  it('builds interaction nodes with selection state', () => {
    expect(buildInteractionNodes(story, 'interaction-2')).toEqual([
      {
        id: 'interaction-1',
        type: 'interaction',
        position: { x: 80, y: 120 },
        data: { title: 'Start', body: 'Start body', selected: false },
      },
      {
        id: 'interaction-2',
        type: 'interaction',
        position: { x: 420, y: 160 },
        data: { title: 'Choice', body: 'Choice body', selected: true },
      },
      {
        id: 'interaction-3',
        type: 'interaction',
        position: { x: 420, y: 320 },
        data: { title: 'Other', body: 'Other body', selected: false },
      },
    ]);
  });

  it('builds one edge per trigger input', () => {
    expect(buildTriggerEdges(story)).toEqual([
      {
        id: 'trigger-linked-interaction-1',
        source: 'interaction-1',
        target: 'interaction-2',
        markerEnd: { type: MarkerType.ArrowClosed },
        label: '1 condition(s)',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          inputInteractionId: 'interaction-1',
        },
      },
      {
        id: 'trigger-linked-interaction-3',
        source: 'interaction-3',
        target: 'interaction-2',
        markerEnd: { type: MarkerType.ArrowClosed },
        label: '1 condition(s)',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          inputInteractionId: 'interaction-3',
        },
      },
    ]);
  });

  it('returns empty graph parts without a story', () => {
    expect(buildInteractionNodes(undefined, undefined)).toEqual([]);
    expect(buildTriggerEdges(undefined)).toEqual([]);
  });
});
