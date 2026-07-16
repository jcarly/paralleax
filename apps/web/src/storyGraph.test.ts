import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import {
  buildInteractionNodes,
  buildTriggerEdges,
  buildTriggerNodes,
  getRelatedTriggerVariantIds,
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
      position: { x: 80, y: 420 },
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
      position: { x: 320, y: 270 },
      triggers: [],
    },
  ],
};

describe('story graph mapping', () => {
  it('builds interaction nodes with selection state', () => {
    expect(buildInteractionNodes(story, 'interaction-2', undefined)).toEqual([
      {
        id: 'interaction-1',
        type: 'interaction',
        position: { x: 80, y: 120 },
        data: {
          title: 'Start',
          body: 'Start body',
          selected: false,
          showNewTriggerInput: false,
          rootTriggerId: 'trigger-root',
          rootTriggerSelected: false,
        },
      },
      {
        id: 'interaction-2',
        type: 'interaction',
        position: { x: 80, y: 420 },
        data: { title: 'Choice', body: 'Choice body', selected: true, showNewTriggerInput: false },
      },
      {
        id: 'interaction-3',
        type: 'interaction',
        position: { x: 320, y: 270 },
        data: { title: 'Other', body: 'Other body', selected: false, showNewTriggerInput: false },
      },
    ]);
  });

  it('marks new-trigger input handles as visible while a connection is active', () => {
    expect(
      buildInteractionNodes(story, undefined, undefined, { showNewTriggerInput: true }).map(
        (node) => node.data.showNewTriggerInput,
      ),
    ).toEqual([true, true, true]);
  });

  it('builds one edge per trigger input without selecting links directly', () => {
    const triggerNodeId = getTriggerNodeId('interaction-2', 'trigger-linked');

    expect(buildTriggerEdges(story)).toEqual([
      {
        id: 'trigger:interaction-2:trigger-linked-interaction-1',
        type: 'trigger',
        source: 'interaction-1',
        sourceHandle: 'interaction-output',
        target: triggerNodeId,
        targetHandle: 'trigger-input',
        className: 'trigger-edge',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          triggerIds: ['trigger-linked'],
          inputInteractionId: 'interaction-1',
          selected: false,
          conditionCount: 1,
        },
      },
      {
        id: 'trigger:interaction-2:trigger-linked-interaction-3',
        type: 'trigger',
        source: 'interaction-3',
        sourceHandle: 'interaction-output',
        target: triggerNodeId,
        targetHandle: 'trigger-input',
        className: 'trigger-edge',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          triggerIds: ['trigger-linked'],
          inputInteractionId: 'interaction-3',
          selected: false,
          conditionCount: 1,
        },
      },
      {
        id: 'trigger:interaction-2:trigger-linked-output',
        type: 'trigger',
        source: triggerNodeId,
        sourceHandle: 'trigger-output',
        target: 'interaction-2',
        targetHandle: 'create-source-input',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8d918f' },
        className: 'trigger-edge',
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          triggerIds: ['trigger-linked'],
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
        position: { x: 235, y: 346 },
        draggable: false,
        selectable: false,
        data: {
          interactionId: 'interaction-2',
          triggerId: 'trigger-linked',
          triggerIds: ['trigger-linked'],
          selected: true,
          conditionCount: 1,
          inputCount: 2,
          orGroupCount: 1,
        },
      },
    ]);
  });

  it('falls back to stable canvas positions when loaded interactions have no position', () => {
    const storyWithMissingPositions = structuredClone(story);
    delete (
      storyWithMissingPositions.interactions[1] as Partial<(typeof story.interactions)[number]>
    ).position;
    delete (
      storyWithMissingPositions.interactions[2] as Partial<(typeof story.interactions)[number]>
    ).position;

    expect(
      buildInteractionNodes(storyWithMissingPositions, undefined, undefined)[1].position,
    ).toEqual({ x: 80, y: 252 });
    expect(() => buildTriggerNodes(storyWithMissingPositions)).not.toThrow();
    expect(buildTriggerNodes(storyWithMissingPositions)[0]).toMatchObject({
      id: 'trigger:interaction-2:trigger-linked',
      type: 'trigger',
      data: {
        interactionId: 'interaction-2',
        triggerId: 'trigger-linked',
      },
    });
  });

  it('groups several triggers with the same inputs behind one trigger marker', () => {
    const groupedStory = structuredClone(story);
    groupedStory.interactions[1].triggers.push({
      id: 'trigger-alternative',
      inputInteractionIds: ['interaction-3', 'interaction-1'],
      conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
    });

    expect(buildTriggerNodes(groupedStory)).toHaveLength(1);
    expect(buildTriggerNodes(groupedStory)[0].data).toMatchObject({
      interactionId: 'interaction-2',
      triggerId: 'trigger-linked',
      triggerIds: ['trigger-linked', 'trigger-alternative'],
      conditionCount: 2,
      inputCount: 2,
      orGroupCount: 2,
    });
    expect(buildTriggerEdges(groupedStory)).toHaveLength(3);
  });

  it('keeps triggers with different input sets in separate visual groups', () => {
    const splitStory = structuredClone(story);
    splitStory.interactions[1].triggers = [
      {
        id: 'trigger-one-input',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      },
      {
        id: 'trigger-two-inputs',
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];

    expect(buildTriggerNodes(splitStory).map((node) => node.data.triggerIds)).toEqual([
      ['trigger-one-input'],
      ['trigger-two-inputs'],
    ]);
    expect(buildTriggerEdges(splitStory)).toHaveLength(5);
  });

  it('finds OR trigger variants by matching the same input set regardless of order', () => {
    const interaction = structuredClone(story.interactions[1]);
    interaction.triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-3', 'interaction-1'],
        conditions: [],
      },
      {
        id: 'trigger-c',
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      },
      {
        id: 'trigger-root',
        inputInteractionIds: [],
        conditions: [],
      },
    ];

    expect(getRelatedTriggerVariantIds(interaction, interaction.triggers[0])).toEqual([
      'trigger-a',
      'trigger-b',
    ]);
    expect(getRelatedTriggerVariantIds(interaction, interaction.triggers[2])).toEqual([
      'trigger-c',
    ]);
    expect(getRelatedTriggerVariantIds(interaction, interaction.triggers[3])).toEqual([
      'trigger-root',
    ]);
  });

  it('returns empty graph parts without a story', () => {
    expect(buildInteractionNodes(undefined, undefined, undefined)).toEqual([]);
    expect(buildTriggerNodes(undefined)).toEqual([]);
    expect(buildTriggerEdges(undefined)).toEqual([]);
  });
});
