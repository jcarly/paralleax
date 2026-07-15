import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import {
  buildInteractionNodes,
  buildTriggerEdges,
  buildTriggerNodes,
  getTriggerNodeId,
} from './storyGraph';

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
        data: {
          title: 'Start',
          body: 'Start body',
          selected: false,
          rootTriggerId: 'trigger-root',
        },
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

  it('builds one edge per trigger input with selected edge state', () => {
    const triggerNodeId = getTriggerNodeId('interaction-2', 'trigger-linked');

    expect(
      buildTriggerEdges(story, {
        interactionId: 'interaction-2',
        triggerId: 'trigger-linked',
        inputInteractionId: 'interaction-3',
      }),
    ).toEqual([
      {
        id: 'trigger-linked-interaction-1',
        type: 'trigger',
        source: 'interaction-1',
        sourceHandle: 'interaction-output',
        target: triggerNodeId,
        targetHandle: 'trigger-input',
        className: 'trigger-edge',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          inputInteractionId: 'interaction-1',
          selected: false,
          conditionCount: 1,
        },
      },
      {
        id: 'trigger-linked-interaction-3',
        type: 'trigger',
        source: 'interaction-3',
        sourceHandle: 'interaction-output',
        target: triggerNodeId,
        targetHandle: 'trigger-input',
        className: 'trigger-edge selected',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          inputInteractionId: 'interaction-3',
          selected: true,
          conditionCount: 1,
        },
      },
      {
        id: 'trigger-linked-output',
        type: 'trigger',
        source: triggerNodeId,
        sourceHandle: 'trigger-output',
        target: 'interaction-2',
        targetHandle: 'new-trigger-input',
        markerEnd: { type: MarkerType.ArrowClosed },
        className: 'trigger-edge',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          selected: false,
          conditionCount: 1,
        },
      },
    ]);
  });

  it('builds one shared trigger node for a multi-input trigger', () => {
    expect(
      buildTriggerNodes(story, {
        interactionId: 'interaction-2',
        triggerId: 'trigger-linked',
      }),
    ).toEqual([
      {
        id: 'trigger:interaction-2:trigger-linked',
        type: 'trigger',
        position: { x: 436, y: 229 },
        draggable: false,
        selectable: false,
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          selected: true,
          conditionCount: 1,
          inputCount: 2,
        },
      },
    ]);
  });

  it('returns empty graph parts without a story', () => {
    expect(buildInteractionNodes(undefined, undefined)).toEqual([]);
    expect(buildTriggerNodes(undefined)).toEqual([]);
    expect(buildTriggerEdges(undefined)).toEqual([]);
  });
});
