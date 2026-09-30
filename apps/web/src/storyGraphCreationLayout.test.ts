import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNextRootPosition, type Story } from '@paralleax/shared';
import { getStoryGraphClickCreationPosition } from './storyGraphCreationLayout';

const { computeStoryGraphElkLayout } = vi.hoisted(() => ({
  computeStoryGraphElkLayout: vi.fn(),
}));

vi.mock('./storyGraphElkLayout', () => ({ computeStoryGraphElkLayout }));

const placeholderInteractionId = '__paralleax_new_interaction__';
const placeholderTriggerId = '__paralleax_new_trigger__';

const story: Story = {
  id: 'creation-layout',
  title: 'Creation layout',
  createdAt: '2026-08-21T08:00:00.000Z',
  updatedAt: '2026-08-21T08:00:00.000Z',
  interactions: [
    {
      id: 'root',
      title: 'Root',
      body: '',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'child',
      title: 'Existing child',
      body: '',
      position: { x: 80, y: 496 },
      triggers: [{ id: 'child-trigger', inputInteractionIds: ['root'], conditions: [] }],
    },
  ],
};

describe('story graph click creation layout', () => {
  beforeEach(() => {
    computeStoryGraphElkLayout.mockReset();
  });

  it('uses the ELK position for a projected child and keeps its source link', async () => {
    const elkPosition = { x: 420, y: 620 };
    computeStoryGraphElkLayout.mockResolvedValue({
      interactionUpdates: [{ interactionId: placeholderInteractionId, position: elkPosition }],
      triggerUpdates: [],
      affectedNodeIds: [placeholderInteractionId],
    });

    await expect(
      getStoryGraphClickCreationPosition(story, { kind: 'child', sourceId: 'root' }),
    ).resolves.toEqual(elkPosition);

    expect(computeStoryGraphElkLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        interactions: expect.arrayContaining([
          expect.objectContaining({
            id: placeholderInteractionId,
            triggers: [expect.objectContaining({ inputInteractionIds: ['root'] })],
          }),
        ]),
      }),
      {
        scope: {
          kind: 'selection',
          targets: [
            { type: 'interaction', interactionId: placeholderInteractionId },
            {
              type: 'trigger',
              interactionId: placeholderInteractionId,
              triggerId: placeholderTriggerId,
            },
          ],
        },
      },
    );
  });

  it('uses the ELK position for a projected parent and keeps its target link', async () => {
    const elkPosition = { x: 160, y: 172 };
    computeStoryGraphElkLayout.mockResolvedValue({
      interactionUpdates: [{ interactionId: placeholderInteractionId, position: elkPosition }],
      triggerUpdates: [],
      affectedNodeIds: [placeholderInteractionId],
    });

    await expect(
      getStoryGraphClickCreationPosition(story, { kind: 'parent', targetId: 'child' }),
    ).resolves.toEqual(elkPosition);

    const [projectedStory, options] = computeStoryGraphElkLayout.mock.calls[0];
    expect(projectedStory.interactions.find(({ id }: { id: string }) => id === 'child')).toEqual(
      expect.objectContaining({
        triggers: expect.arrayContaining([
          expect.objectContaining({ inputInteractionIds: [placeholderInteractionId] }),
        ]),
      }),
    );
    expect(options).toEqual({
      scope: {
        kind: 'selection',
        targets: [
          { type: 'interaction', interactionId: placeholderInteractionId },
          { type: 'trigger', interactionId: 'child', triggerId: placeholderTriggerId },
        ],
      },
    });
  });

  it('keeps the collision-free default position when ELK has no scoped update or fails', async () => {
    const fallback = getNextRootPosition(story);
    computeStoryGraphElkLayout.mockResolvedValue({
      interactionUpdates: [],
      triggerUpdates: [],
      affectedNodeIds: [],
    });

    await expect(getStoryGraphClickCreationPosition(story, { kind: 'root' })).resolves.toEqual(
      fallback,
    );

    computeStoryGraphElkLayout.mockRejectedValueOnce(new Error('ELK unavailable'));
    await expect(getStoryGraphClickCreationPosition(story, { kind: 'root' })).resolves.toEqual(
      fallback,
    );
  });

  it('does not invoke ELK when a referenced interaction no longer exists', async () => {
    await expect(
      getStoryGraphClickCreationPosition(story, { kind: 'child', sourceId: 'missing' }),
    ).resolves.toBeUndefined();
    await expect(
      getStoryGraphClickCreationPosition(story, { kind: 'parent', targetId: 'missing' }),
    ).resolves.toBeUndefined();
    expect(computeStoryGraphElkLayout).not.toHaveBeenCalled();
  });
});
