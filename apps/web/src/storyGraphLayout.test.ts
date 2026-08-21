import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { interactionNodeHeight, interactionNodeWidth } from './storyGraph';
import { computeStoryGraphLayout } from './storyGraphLayout';

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
        triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'left',
        title: 'Left branch',
        body: '',
        position: { x: 90, y: 140 },
        triggers: [{ id: 'trigger-left', inputInteractionIds: ['root'], conditions: [] }],
      },
      {
        id: 'right',
        title: 'Right branch',
        body: '',
        position: { x: 100, y: 160 },
        triggers: [{ id: 'trigger-right', inputInteractionIds: ['root'], conditions: [] }],
      },
      {
        id: 'merge',
        title: 'Merge',
        body: '',
        position: { x: 110, y: 180 },
        triggers: [
          {
            id: 'trigger-merge',
            inputInteractionIds: ['left', 'right'],
            conditions: [],
          },
        ],
      },
      {
        id: 'isolated',
        title: 'Isolated',
        body: '',
        position: { x: 120, y: 200 },
        triggers: [{ id: 'trigger-isolated', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}

function applyInteractionUpdates(
  story: Story,
  updates: ReturnType<typeof computeStoryGraphLayout>,
) {
  const positions = new Map(story.interactions.map(({ id, position }) => [id, position]));
  updates.interactionUpdates.forEach(({ interactionId, position }) =>
    positions.set(interactionId, position),
  );
  return positions;
}

describe('story graph automatic layout', () => {
  it('spaces branches, convergence markers, and disconnected components in a vertical hierarchy', () => {
    const story = createLayoutStory();
    const result = computeStoryGraphLayout(story, { kind: 'all' });
    const positions = applyInteractionUpdates(story, result);

    expect(result.triggerUpdates.map(({ triggerIds }) => triggerIds)).toEqual([
      ['trigger-left'],
      ['trigger-right'],
      ['trigger-merge'],
    ]);
    expect(positions.get('root')!.y).toBeLessThan(positions.get('left')!.y);
    expect(positions.get('root')!.y).toBeLessThan(positions.get('right')!.y);
    expect(positions.get('left')!.y).toBeLessThan(positions.get('merge')!.y);
    expect(positions.get('right')!.y).toBeLessThan(positions.get('merge')!.y);

    const interactionPositions = [...positions.values()];
    interactionPositions.forEach((left, leftIndex) => {
      interactionPositions.slice(leftIndex + 1).forEach((right) => {
        const overlaps = !(
          left.x + interactionNodeWidth <= right.x ||
          right.x + interactionNodeWidth <= left.x ||
          left.y + interactionNodeHeight <= right.y ||
          right.y + interactionNodeHeight <= left.y
        );
        expect(overlaps).toBe(false);
      });
    });

    const leftMarker = result.triggerUpdates.find(({ triggerIds }) =>
      triggerIds.includes('trigger-left'),
    )!.position;
    expect(leftMarker.y).toBeGreaterThan(positions.get('root')!.y + interactionNodeHeight);
    expect(leftMarker.y + 20).toBeLessThan(positions.get('left')!.y);
    expect(positions.get('isolated')!.x).toBeGreaterThan(
      Math.max(
        positions.get('root')!.x,
        positions.get('left')!.x,
        positions.get('right')!.x,
        positions.get('merge')!.x,
      ) + interactionNodeWidth,
    );
  });

  it('keeps a dense option fan-out separated with the rendered interaction heights', () => {
    const optionCount = 24;
    const story: Story = {
      id: 'dense-layout',
      title: 'Dense layout',
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-08-20T08:00:00.000Z',
      interactions: [
        {
          id: 'root',
          title: 'Root with many options',
          body: '',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
        },
        ...Array.from({ length: optionCount }, (_, index) => ({
          id: `option-${index}`,
          title: `Option ${index}`,
          body: '',
          position: { x: 80, y: 120 },
          triggers: [
            {
              id: `trigger-option-${index}`,
              inputInteractionIds: ['root'],
              conditions: [],
            },
          ],
        })),
      ],
    };
    const interactionSizes = new Map<string, { width: number; height: number }>(
      story.interactions.map(
        ({ id }, index) =>
          [
            id,
            {
              width: interactionNodeWidth,
              height: index === 0 ? 280 : 140 + (index % 5) * 34,
            },
          ] as const,
      ),
    );

    const result = computeStoryGraphLayout(story, { kind: 'all' }, { interactionSizes });
    const positions = applyInteractionUpdates(story, result);
    const rectangles = story.interactions.map(({ id }) => ({
      id,
      ...positions.get(id)!,
      ...interactionSizes.get(id)!,
    }));

    rectangles.forEach((left, leftIndex) => {
      rectangles.slice(leftIndex + 1).forEach((right) => {
        const overlaps = !(
          left.x + left.width <= right.x ||
          right.x + right.width <= left.x ||
          left.y + left.height <= right.y ||
          right.y + right.height <= left.y
        );
        expect(overlaps, `${left.id} overlaps ${right.id}`).toBe(false);
      });
    });

    result.triggerUpdates.forEach(({ triggerIds, position }) => {
      rectangles.forEach((interaction) => {
        const overlaps = !(
          position.x + 20 <= interaction.x ||
          interaction.x + interaction.width <= position.x ||
          position.y + 20 <= interaction.y ||
          interaction.y + interaction.height <= position.y
        );
        expect(overlaps, `${triggerIds[0]} overlaps ${interaction.id}`).toBe(false);
      });
    });

    expect(result.triggerUpdates).toHaveLength(optionCount);
    expect(Math.min(...result.triggerUpdates.map(({ position }) => position.y))).toBeGreaterThan(
      positions.get('root')!.y + interactionSizes.get('root')!.height,
    );
  });

  it('keeps crossed branch targets aligned with their own trigger markers', () => {
    const story: Story = {
      id: 'crossed-branches',
      title: 'Crossed branches',
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-08-20T08:00:00.000Z',
      interactions: [
        {
          id: 'root',
          title: 'Root',
          body: '',
          position: { x: 300, y: 100 },
          triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
        },
        {
          id: 'branch-left',
          title: 'Left branch',
          body: '',
          position: { x: 80, y: 300 },
          triggers: [
            {
              id: 'branch-left-trigger',
              inputInteractionIds: ['root'],
              conditions: [],
            },
          ],
        },
        {
          id: 'branch-right',
          title: 'Right branch',
          body: '',
          position: { x: 520, y: 300 },
          triggers: [
            {
              id: 'branch-right-trigger',
              inputInteractionIds: ['root'],
              conditions: [],
            },
          ],
        },
        {
          id: 'destination-left',
          title: 'Authored on the left',
          body: '',
          position: { x: 80, y: 600 },
          triggers: [
            {
              id: 'destination-left-trigger',
              inputInteractionIds: ['branch-right'],
              conditions: [],
            },
          ],
        },
        {
          id: 'destination-right',
          title: 'Authored on the right',
          body: '',
          position: { x: 520, y: 600 },
          triggers: [
            {
              id: 'destination-right-trigger',
              inputInteractionIds: ['branch-left'],
              conditions: [],
            },
          ],
        },
      ],
    };

    const result = computeStoryGraphLayout(story, { kind: 'all' });
    const interactionPositions = applyInteractionUpdates(story, result);
    const triggerPositions = new Map(
      result.triggerUpdates.map(({ triggerIds, position }) => [triggerIds[0], position]),
    );
    const sourceDelta =
      interactionPositions.get('branch-left')!.x - interactionPositions.get('branch-right')!.x;
    const destinationTriggerDelta =
      triggerPositions.get('destination-right-trigger')!.x -
      triggerPositions.get('destination-left-trigger')!.x;
    const destinationDelta =
      interactionPositions.get('destination-right')!.x -
      interactionPositions.get('destination-left')!.x;

    expect(sourceDelta * destinationTriggerDelta).toBeGreaterThan(0);
    expect(destinationTriggerDelta * destinationDelta).toBeGreaterThan(0);
  });

  it('centers parents over uneven option bundles instead of compacting each layer globally', () => {
    const story: Story = {
      id: 'uneven-option-bundles',
      title: 'Uneven option bundles',
      createdAt: '2026-08-20T08:00:00.000Z',
      updatedAt: '2026-08-20T08:00:00.000Z',
      interactions: [
        {
          id: 'root',
          title: 'Root',
          body: '',
          position: { x: 500, y: 80 },
          triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
        },
        ...['parent-a', 'parent-b'].map((id, index) => ({
          id,
          title: id,
          body: '',
          position: { x: 300 + index * 400, y: 300 },
          triggers: [
            {
              id: `${id}-trigger`,
              inputInteractionIds: ['root'],
              conditions: [],
            },
          ],
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          id: `child-a-${index}`,
          title: `A ${index}`,
          body: '',
          position: { x: 80 + index * 350, y: 600 },
          triggers: [
            {
              id: `child-a-${index}-trigger`,
              inputInteractionIds: ['parent-a'],
              conditions: [],
            },
          ],
        })),
        {
          id: 'child-b',
          title: 'B',
          body: '',
          position: { x: 1480, y: 600 },
          triggers: [
            {
              id: 'child-b-trigger',
              inputInteractionIds: ['parent-b'],
              conditions: [],
            },
          ],
        },
      ],
    };

    const result = computeStoryGraphLayout(story, { kind: 'all' });
    const interactionPositions = applyInteractionUpdates(story, result);
    const interactionCenters = new Map(
      [...interactionPositions].map(([id, position]) => [
        id,
        position.x + interactionNodeWidth / 2,
      ]),
    );
    const triggerCenters = new Map(
      result.triggerUpdates.map(({ triggerIds, position }) => [triggerIds[0], position.x + 10]),
    );
    const parentAChildTriggerCenters = Array.from({ length: 4 }, (_, index) =>
      triggerCenters.get(`child-a-${index}-trigger`),
    ).sort((left, right) => left! - right!) as number[];
    const parentAMedian = (parentAChildTriggerCenters[1] + parentAChildTriggerCenters[2]) / 2;

    expect(Math.abs(interactionCenters.get('parent-a')! - parentAMedian)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(interactionCenters.get('parent-b')! - triggerCenters.get('child-b-trigger')!),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(interactionCenters.get('child-b')! - triggerCenters.get('child-b-trigger')!),
    ).toBeLessThanOrEqual(1);
  });

  it('lays out cycles deterministically without stacking their interactions', () => {
    const story = createLayoutStory();
    story.interactions = [
      {
        id: 'cycle-a',
        title: 'A',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'to-a', inputInteractionIds: ['cycle-b'], conditions: [] }],
      },
      {
        id: 'cycle-b',
        title: 'B',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'to-b', inputInteractionIds: ['cycle-a'], conditions: [] }],
      },
    ];

    const first = computeStoryGraphLayout(story, { kind: 'all' });
    const second = computeStoryGraphLayout(story, { kind: 'all' });
    const positions = applyInteractionUpdates(story, first);

    expect(first).toEqual(second);
    expect(positions.get('cycle-a')).not.toEqual(positions.get('cycle-b'));
    expect(Object.values(positions.get('cycle-a')!).every(Number.isFinite)).toBe(true);
    expect(Object.values(positions.get('cycle-b')!).every(Number.isFinite)).toBe(true);
  });

  it('moves only the selected interaction and elastically follows a saved connected marker', () => {
    const story = createLayoutStory();
    story.interactions = story.interactions.slice(0, 3);
    story.interactions[1].triggers[0].position = { x: 500, y: 500 };
    const rootPosition = story.interactions[0].position;
    const rightPosition = story.interactions[2].position;

    const result = computeStoryGraphLayout(story, {
      kind: 'selection',
      targets: [{ type: 'interaction', interactionId: 'left' }],
    });

    expect(result.interactionUpdates).toHaveLength(1);
    expect(result.interactionUpdates[0].interactionId).toBe('left');
    expect(result.interactionUpdates[0].position.y).toBeGreaterThan(rootPosition.y);
    expect(result.interactionUpdates[0].position).not.toEqual(rightPosition);
    expect(result.triggerUpdates).toHaveLength(1);
    expect(result.triggerUpdates[0].triggerIds).toEqual(['trigger-left']);
    expect(result.triggerUpdates[0].position).not.toEqual({ x: 500, y: 500 });
    expect(result.affectedNodeIds).toEqual(['left']);
  });

  it('positions a selected grouped trigger without moving its interactions', () => {
    const story = createLayoutStory();
    story.interactions = story.interactions.slice(0, 2);
    story.interactions[1].position = { x: 80, y: 500 };
    story.interactions[1].triggers.push({
      id: 'trigger-left-variant',
      inputInteractionIds: ['root'],
      conditions: [{ interactionId: 'root', hasBeenVisited: true }],
    });

    const result = computeStoryGraphLayout(story, {
      kind: 'selection',
      targets: [{ type: 'trigger', interactionId: 'left', triggerId: 'trigger-left-variant' }],
    });

    expect(result.interactionUpdates).toEqual([]);
    expect(result.triggerUpdates).toHaveLength(1);
    expect(result.triggerUpdates[0].triggerIds).toEqual(['trigger-left', 'trigger-left-variant']);
    expect(result.triggerUpdates[0].position.y).toBeGreaterThan(
      story.interactions[0].position.y + interactionNodeHeight,
    );
    expect(result.triggerUpdates[0].position.y).toBeLessThan(story.interactions[1].position.y);
    expect(result.affectedNodeIds).toEqual(['trigger:left:trigger-left']);
  });

  it('accepts several interaction and trigger targets for future multi-selection', () => {
    const story = createLayoutStory();
    const result = computeStoryGraphLayout(story, {
      kind: 'selection',
      targets: [
        { type: 'interaction', interactionId: 'left' },
        { type: 'interaction', interactionId: 'right' },
        { type: 'trigger', interactionId: 'merge', triggerId: 'trigger-merge' },
      ],
    });

    expect(result.interactionUpdates.map(({ interactionId }) => interactionId).sort()).toEqual([
      'left',
      'right',
    ]);
    expect(
      result.triggerUpdates.some(({ triggerIds }) => triggerIds.includes('trigger-merge')),
    ).toBe(true);
    expect(result.affectedNodeIds).toEqual(['left', 'right', 'trigger:merge:trigger-merge']);
  });

  it('does nothing for an empty future selection', () => {
    expect(
      computeStoryGraphLayout(createLayoutStory(), { kind: 'selection', targets: [] }),
    ).toEqual({ interactionUpdates: [], triggerUpdates: [], affectedNodeIds: [] });
  });
});
