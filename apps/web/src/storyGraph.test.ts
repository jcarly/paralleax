import { describe, expect, it } from 'vitest';
import { MarkerType } from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import {
  applyInteractionDragEdgePreview,
  applyInteractionDragTriggerPreview,
  buildInteractionNodes,
  buildTriggerEdges,
  buildTriggerNodes,
  getInteractionDragTriggerPositionUpdates,
  getRelatedTriggerVariantIds,
  getRoutingHandleIds,
  getTriggerNodeId,
} from './storyGraph';
import { getTriggerEdgeStepPosition } from './triggerEdgeRouting';

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

  it('projects the real location and ordered cast onto interaction cards', () => {
    const contextualStory = structuredClone(story);
    contextualStory.locations = [{ id: 'archive', name: 'Lower archive', description: '' }];
    contextualStory.characters = [
      {
        id: 'mara',
        name: 'Mara Venn',
        description: '',
        imageUrl: 'https://example.com/mara.png',
      },
      { id: 'ivo', name: 'Ivo Hale', description: '' },
    ];
    contextualStory.interactions[1].locationId = 'archive';
    contextualStory.interactions[1].characterIds = ['ivo', 'mara', 'missing-character'];

    expect(buildInteractionNodes(contextualStory, undefined)[1].data).toMatchObject({
      location: { id: 'archive', name: 'Lower archive' },
      characters: [
        { id: 'ivo', name: 'Ivo Hale' },
        { id: 'mara', name: 'Mara Venn', imageUrl: 'https://example.com/mara.png' },
      ],
    });
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
        sourceHandle: 'routing-output-bottom',
        target: triggerNodeId,
        targetHandle: 'routing-input-top',
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
        sourceHandle: 'routing-output-bottom',
        target: triggerNodeId,
        targetHandle: 'routing-input-top',
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
        sourceHandle: 'routing-output-bottom',
        target: 'interaction-2',
        targetHandle: 'routing-input-top',
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

  it('uses separate vertical routing lanes for edges sharing the same graph band', () => {
    const bandStory: Story = {
      id: 'routing-bands',
      title: 'Routing bands',
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-08-20T08:00:00.000Z',
      interactions: [
        {
          id: 'source-left',
          title: 'Left source',
          body: '',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'root-left', inputInteractionIds: [], conditions: [] }],
        },
        {
          id: 'source-right',
          title: 'Right source',
          body: '',
          position: { x: 440, y: 120 },
          triggers: [{ id: 'root-right', inputInteractionIds: [], conditions: [] }],
        },
        {
          id: 'target-left',
          title: 'Left target',
          body: '',
          position: { x: 80, y: 520 },
          triggers: [
            {
              id: 'trigger-left',
              inputInteractionIds: ['source-left'],
              conditions: [],
              position: { x: 175, y: 330 },
            },
          ],
        },
        {
          id: 'target-right',
          title: 'Right target',
          body: '',
          position: { x: 440, y: 520 },
          triggers: [
            {
              id: 'trigger-right',
              inputInteractionIds: ['source-right'],
              conditions: [],
              position: { x: 535, y: 330 },
            },
          ],
        },
      ],
    };

    const inputEdges = buildTriggerEdges(bandStory).filter(
      ({ data }) => data?.inputInteractionId !== undefined,
    );

    expect(inputEdges.map(({ targetHandle }) => targetHandle)).toEqual([
      'routing-input-top',
      'routing-input-top',
    ]);
    expect(inputEdges.map(({ data }) => data?.routingLaneIndex).sort()).toEqual([0, 1]);
    expect(inputEdges.map(({ data }) => data?.routingLaneCount)).toEqual([2, 2]);
    expect(
      inputEdges.map(({ data }) =>
        getTriggerEdgeStepPosition(data?.routingLaneIndex, data?.routingLaneCount, true),
      ),
    ).toEqual([0.62, 0.86]);
    expect(getTriggerEdgeStepPosition(undefined, undefined, true)).toBe(0.74);
    expect(getTriggerEdgeStepPosition(undefined, undefined, false)).toBe(0.26);
  });

  it('routes edges through matching handles for every relative direction', () => {
    expect(getRoutingHandleIds({ x: 0, y: 0 }, { x: 300, y: 20 })).toEqual({
      sourceHandle: 'routing-output-right',
      targetHandle: 'routing-input-left',
    });
    expect(getRoutingHandleIds({ x: 300, y: 20 }, { x: 0, y: 0 })).toEqual({
      sourceHandle: 'routing-output-left',
      targetHandle: 'routing-input-right',
    });
    expect(getRoutingHandleIds({ x: 0, y: 0 }, { x: 20, y: 300 })).toEqual({
      sourceHandle: 'routing-output-bottom',
      targetHandle: 'routing-input-top',
    });
    expect(getRoutingHandleIds({ x: 20, y: 300 }, { x: 0, y: 0 })).toEqual({
      sourceHandle: 'routing-output-top',
      targetHandle: 'routing-input-bottom',
    });
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
        position: { x: 235, y: 356 },
        draggable: true,
        selectable: true,
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

  it('uses a saved trigger position instead of recalculating the marker placement', () => {
    const positionedStory = structuredClone(story);
    positionedStory.interactions[1].triggers[0].position = { x: 420, y: 468 };

    expect(buildTriggerNodes(positionedStory)[0].position).toEqual({ x: 420, y: 468 });
    expect(buildTriggerEdges(positionedStory)[2]).toMatchObject({
      sourceHandle: 'routing-output-left',
      targetHandle: 'routing-input-top',
    });
  });

  it('updates only connected automatic trigger nodes during an interaction drag', () => {
    const previewStory = structuredClone(story);
    previewStory.interactions[1].triggers.push({
      id: 'trigger-unrelated',
      inputInteractionIds: ['interaction-3'],
      conditions: [],
    });
    const nodes = [
      ...buildInteractionNodes(previewStory, undefined),
      ...buildTriggerNodes(previewStory),
    ];
    const affectedId = getTriggerNodeId('interaction-2', 'trigger-linked');
    const unrelatedId = getTriggerNodeId('interaction-2', 'trigger-unrelated');
    const affectedBefore = nodes.find((node) => node.id === affectedId);
    const unrelatedBefore = nodes.find((node) => node.id === unrelatedId);

    const preview = applyInteractionDragTriggerPreview(nodes, previewStory, 'interaction-1', {
      x: 180,
      y: 220,
    });

    expect(preview).not.toBe(nodes);
    expect(preview.find((node) => node.id === affectedId)).not.toBe(affectedBefore);
    expect(preview.find((node) => node.id === affectedId)?.position).not.toEqual(
      affectedBefore?.position,
    );
    expect(preview.find((node) => node.id === unrelatedId)).toBe(unrelatedBefore);
    nodes
      .filter((node) => node.type === 'interaction')
      .forEach((node) => expect(preview.find((candidate) => candidate.id === node.id)).toBe(node));
    expect(
      getInteractionDragTriggerPositionUpdates(previewStory, 'interaction-1', {
        x: 180,
        y: 220,
      }),
    ).toEqual([]);
  });

  it('moves a saved trigger marker by less than its automatic anchor during interaction drag', () => {
    const positionedStory = structuredClone(story);
    positionedStory.interactions[1].triggers[0].position = { x: 420, y: 468 };
    positionedStory.interactions[1].triggers.push({
      id: 'trigger-linked-variant',
      inputInteractionIds: ['interaction-3', 'interaction-1'],
      conditions: [],
      position: { x: 420, y: 468 },
    });
    const nodes = [
      ...buildInteractionNodes(positionedStory, undefined),
      ...buildTriggerNodes(positionedStory),
    ];
    const automaticNodes = [
      ...buildInteractionNodes(story, undefined),
      ...buildTriggerNodes(story),
    ];
    const finalInteractionPosition = { x: 180, y: 220 };
    const triggerNodeId = getTriggerNodeId('interaction-2', 'trigger-linked');
    const automaticBefore = automaticNodes.find((node) => node.id === triggerNodeId)!;
    const automaticAfter = applyInteractionDragTriggerPreview(
      automaticNodes,
      story,
      'interaction-1',
      finalInteractionPosition,
    ).find((node) => node.id === triggerNodeId)!;

    const preview = applyInteractionDragTriggerPreview(
      nodes,
      positionedStory,
      'interaction-1',
      finalInteractionPosition,
    );
    const savedBefore = nodes.find((node) => node.id === triggerNodeId)!;
    const savedAfter = preview.find((node) => node.id === triggerNodeId)!;
    const automaticMovement = automaticAfter.position.x - automaticBefore.position.x;
    const savedMovement = savedAfter.position.x - savedBefore.position.x;

    expect(preview).not.toBe(nodes);
    expect(savedMovement).toBeGreaterThan(0);
    expect(savedMovement).toBeLessThan(automaticMovement);
    expect(savedAfter.position.y - savedBefore.position.y).toBe(savedMovement);
    expect(
      getInteractionDragTriggerPositionUpdates(
        positionedStory,
        'interaction-1',
        finalInteractionPosition,
      ),
    ).toEqual([
      {
        interactionId: 'interaction-2',
        triggerIds: ['trigger-linked', 'trigger-linked-variant'],
        position: savedAfter.position,
      },
    ]);
  });

  it('makes saved trigger markers nearer their automatic anchor follow more closely', () => {
    const nearStory = structuredClone(story);
    nearStory.interactions[1].triggers[0].position = { x: 235, y: 356 };
    const farStory = structuredClone(story);
    farStory.interactions[1].triggers[0].position = { x: 700, y: 700 };
    const finalInteractionPosition = { x: 180, y: 220 };
    const nearUpdate = getInteractionDragTriggerPositionUpdates(
      nearStory,
      'interaction-1',
      finalInteractionPosition,
    )[0];
    const farUpdate = getInteractionDragTriggerPositionUpdates(
      farStory,
      'interaction-1',
      finalInteractionPosition,
    )[0];

    expect(nearUpdate.position.x - 235).toBeGreaterThan(farUpdate.position.x - 700);
    expect(nearUpdate.position.y - 356).toBeGreaterThan(farUpdate.position.y - 700);
  });

  it('previews the same edge handles that will be used after the drag is saved', () => {
    const previewStory = structuredClone(story);
    previewStory.interactions[1].triggers.push({
      id: 'trigger-unrelated',
      inputInteractionIds: ['interaction-3'],
      conditions: [],
    });
    const edges = buildTriggerEdges(previewStory);
    const finalPosition = { x: 700, y: 500 };
    const preview = applyInteractionDragEdgePreview(
      edges,
      previewStory,
      'interaction-1',
      finalPosition,
    );
    const savedStory = structuredClone(previewStory);
    savedStory.interactions[0].position = finalPosition;
    const savedEdges = buildTriggerEdges(savedStory);
    const unrelatedEdgeId = `${getTriggerNodeId(
      'interaction-2',
      'trigger-unrelated',
    )}-interaction-3`;

    expect(preview).not.toBe(edges);
    expect(
      preview.some(
        (edge, index) =>
          edge.sourceHandle !== edges[index].sourceHandle ||
          edge.targetHandle !== edges[index].targetHandle,
      ),
    ).toBe(true);
    preview.forEach((edge) => {
      const savedEdge = savedEdges.find((candidate) => candidate.id === edge.id);
      expect({ sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle }).toEqual({
        sourceHandle: savedEdge?.sourceHandle,
        targetHandle: savedEdge?.targetHandle,
      });
    });
    expect(preview.find((edge) => edge.id === unrelatedEdgeId)).toBe(
      edges.find((edge) => edge.id === unrelatedEdgeId),
    );
  });

  it('projects open comments for an interaction and its root trigger independently', () => {
    expect(
      buildInteractionNodes(story, undefined, undefined, {
        commentCounts: new Map([
          ['interaction-1', 1],
          ['trigger-root', 2],
        ]),
      })[0].data,
    ).toMatchObject({ commentCount: 1, rootTriggerCommentCount: 2 });
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

  it('points a grouped trigger badge at a variant that has an open comment', () => {
    const groupedStory = structuredClone(story);
    groupedStory.interactions[1].triggers.push({
      id: 'trigger-alternative',
      inputInteractionIds: ['interaction-3', 'interaction-1'],
      conditions: [],
    });

    expect(
      buildTriggerNodes(groupedStory, undefined, {
        commentCounts: new Map([['trigger-alternative', 2]]),
      })[0].data,
    ).toMatchObject({ commentCount: 2, commentTargetId: 'trigger-alternative' });
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
