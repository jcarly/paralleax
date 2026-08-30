import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import {
  applyStoryGraphPositionPatch,
  diffStoryGraphPositions,
  updateStoryGraphPositions,
} from './positions.js';

describe('authored Story graph positions', () => {
  it('applies interaction and grouped Trigger positions in one Story projection', () => {
    const story: Story = {
      id: 'story-1',
      title: 'Graph',
      interactions: [
        {
          id: 'interaction-1',
          title: 'Start',
          body: '',
          position: { x: 10, y: 20 },
          triggers: [
            { id: 'trigger-1', inputInteractionIds: [], conditions: [] },
            { id: 'trigger-2', inputInteractionIds: [], conditions: [] },
          ],
        },
      ],
      createdAt: '2026-08-28T08:00:00.000Z',
      updatedAt: '2026-08-28T08:00:00.000Z',
    };

    const updated = updateStoryGraphPositions(story, {
      interactionUpdates: [{ interactionId: 'interaction-1', position: { x: 100, y: 200 } }],
      triggerUpdates: [
        {
          interactionId: 'interaction-1',
          triggerIds: ['trigger-1', 'trigger-2'],
          position: { x: 80, y: 140 },
        },
      ],
    });

    expect(updated.interactions[0].position).toEqual({ x: 100, y: 200 });
    expect(updated.interactions[0].triggers.map(({ position }) => position)).toEqual([
      { x: 80, y: 140 },
      { x: 80, y: 140 },
    ]);
  });

  it('diffs and reapplies restored positions, including removal of a Trigger position', () => {
    const before: Story = {
      id: 'story-1',
      title: 'Graph',
      interactions: [
        {
          id: 'interaction-1',
          title: 'Start',
          body: '',
          position: { x: 10, y: 20 },
          triggers: [
            {
              id: 'trigger-1',
              inputInteractionIds: [],
              conditions: [],
              position: { x: 15, y: 80 },
            },
          ],
        },
        {
          id: 'unchanged',
          title: 'Unchanged',
          body: '',
          position: { x: 200, y: 20 },
          triggers: [],
        },
      ],
      createdAt: '2026-08-28T08:00:00.000Z',
      updatedAt: '2026-08-28T08:00:00.000Z',
    };
    const after: Story = {
      ...before,
      interactions: [
        {
          ...before.interactions[0],
          position: { x: 100, y: 200 },
          triggers: [{ ...before.interactions[0].triggers[0], position: undefined }],
        },
        before.interactions[1],
      ],
    };

    const patch = diffStoryGraphPositions(before, after);
    const applied = applyStoryGraphPositionPatch(before, patch);

    expect(patch).toEqual({
      interactionUpdates: [{ interactionId: 'interaction-1', position: { x: 100, y: 200 } }],
      triggerUpdates: [{ interactionId: 'interaction-1', triggerIds: ['trigger-1'] }],
    });
    expect(applied.interactions[0]).toEqual(after.interactions[0]);
    expect(applied.interactions[0].triggers[0]).not.toHaveProperty('position');
    expect(applied.interactions[1]).toBe(before.interactions[1]);
  });
});
