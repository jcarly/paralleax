import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeServerStory, type Interaction, type Story } from '@paralleax/shared';
import { api } from '../../../api';
import { useStoryGraphPersistence } from './storyGraphPersistence';
import type { MergeIncomingStory, StoryStateSetter, TrackStorySave } from './storyPersistenceTypes';

vi.mock('../../../api', () => ({
  api: {
    createInteraction: vi.fn(),
    updateInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
    addTrigger: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    createGraphDecoration: vi.fn(),
    updateGraphDecoration: vi.fn(),
    deleteGraphDecoration: vi.fn(),
  },
}));

describe('story graph persistence', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates interactions and applies compact entity results to parent-owned state', async () => {
    const harness = createHarness();
    const created = interaction('created', 'New interaction', { x: 300, y: 400 });
    created.triggers[0].inputInteractionIds = ['root'];
    vi.mocked(api.createInteraction).mockResolvedValue({
      interaction: created,
      ...metadata(2),
    });

    await harness.actions.createChildFromInteraction('root', { x: 300, y: 400 });

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'root',
      position: { x: 300, y: 400 },
    });
    expect(harness.story().interactions.at(-1)).toEqual(created);
    expect(harness.story()).toMatchObject(metadata(2));
  });

  it('serializes interaction patches and preserves both optimistic fields', async () => {
    const harness = createHarness();
    let resolveFirst:
      ((result: Awaited<ReturnType<typeof api.updateInteraction>>) => void) | undefined;
    const firstResponse = new Promise<Awaited<ReturnType<typeof api.updateInteraction>>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    vi.mocked(api.updateInteraction)
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({
        interaction: interaction('root', 'Updated title', { x: 0, y: 0 }, '<p>Updated body</p>'),
        ...metadata(3),
      });

    const titleSave = harness.actions.patchInteraction('root', { title: 'Updated title' });
    const bodySave = harness.actions.patchInteraction('root', { body: '<p>Updated body</p>' });
    await Promise.resolve();
    expect(api.updateInteraction).toHaveBeenCalledTimes(1);

    resolveFirst?.({
      interaction: interaction('root', 'Updated title', { x: 0, y: 0 }),
      ...metadata(2),
    });
    await titleSave;
    await bodySave;

    expect(api.updateInteraction).toHaveBeenNthCalledWith(1, 'story-1', 'root', {
      title: 'Updated title',
    });
    expect(api.updateInteraction).toHaveBeenNthCalledWith(2, 'story-1', 'root', {
      body: '<p>Updated body</p>',
    });
    expect(harness.story().interactions[0]).toMatchObject({
      title: 'Updated title',
      body: '<p>Updated body</p>',
    });
  });

  it('retains trigger deletion tombstones when a complete response is stale', async () => {
    const harness = createHarness();
    const staleResponse = {
      ...storyFixture(),
      revision: 2,
      updatedAt: metadata(2).updatedAt,
    };
    vi.mocked(api.deleteTrigger).mockResolvedValue(staleResponse);

    await harness.actions.deleteTrigger('child', 'alternative-trigger');

    expect(harness.deletedTriggerIdsRef.current).toContain('alternative-trigger');
    expect(harness.story().interactions[1].triggers.map(({ id }) => id)).toEqual(['child-trigger']);
  });

  it('creates, updates, and deletes decorations through existing domain operations', async () => {
    const harness = createHarness();
    vi.mocked(api.createGraphDecoration).mockResolvedValue({
      decoration: {
        id: 'frame',
        kind: 'frame',
        position: { x: 10, y: 20 },
        width: 420,
        height: 240,
        color: '#5b6ee1',
      },
      ...metadata(2),
    });
    vi.mocked(api.updateGraphDecoration).mockResolvedValue({
      decoration: {
        id: 'frame',
        kind: 'frame',
        position: { x: 30, y: 40 },
        width: 420,
        height: 240,
        color: '#5b6ee1',
      },
      ...metadata(3),
    });
    vi.mocked(api.deleteGraphDecoration).mockResolvedValue({
      ...storyFixture(),
      revision: 4,
      updatedAt: metadata(4).updatedAt,
    });

    await expect(harness.actions.createGraphDecoration('frame', { x: 10, y: 20 })).resolves.toBe(
      'frame',
    );
    await harness.actions.updateGraphDecoration('frame', { position: { x: 30, y: 40 } });
    expect(harness.story().graphDecorations?.[0].position).toEqual({ x: 30, y: 40 });

    await harness.actions.deleteGraphDecoration('frame');
    expect(harness.story().graphDecorations).toEqual([]);
  });
});

function createHarness() {
  let story: Story | undefined = storyFixture();
  const setStory: StoryStateSetter = (next) => {
    story = typeof next === 'function' ? next(story) : next;
  };
  const trackSave: TrackStorySave = async (operation) => operation();
  const deletedTriggerIdsRef = { current: new Set<string>() };
  const deletedTriggerInputKeysRef = { current: new Set<string>() };
  const mergeIncomingStory: MergeIncomingStory = (current, incoming, edited, options) =>
    mergeServerStory(current, incoming, edited, {
      ...options,
      deletedTriggerIds: deletedTriggerIdsRef.current,
      deletedTriggerInputKeys: deletedTriggerInputKeysRef.current,
    });
  const { result } = renderHook(() =>
    useStoryGraphPersistence({
      storyId: 'story-1',
      story,
      setStory,
      trackSave,
      mergeIncomingStory,
      deletedTriggerIdsRef,
      deletedTriggerInputKeysRef,
    }),
  );

  return {
    actions: result.current,
    deletedTriggerIdsRef,
    story: () => {
      if (!story) throw new Error('Expected a loaded story');
      return story;
    },
  };
}

function metadata(revision: number) {
  return {
    revision,
    updatedAt: `2026-08-26T11:00:0${revision}.000Z`,
  };
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    revision: 1,
    title: 'Story',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    graphDecorations: [],
    interactions: [
      interaction('root', 'Root', { x: 0, y: 0 }),
      {
        ...interaction('child', 'Child', { x: 0, y: 200 }),
        triggers: [
          { id: 'child-trigger', inputInteractionIds: ['root'], conditions: [] },
          { id: 'alternative-trigger', inputInteractionIds: ['root'], conditions: [] },
        ],
      },
    ],
  };
}

function interaction(
  id: string,
  title: string,
  position: { x: number; y: number },
  body = '',
): Interaction {
  return {
    id,
    title,
    body,
    position,
    durationMinutes: 0,
    triggers: [{ id: `${id}-trigger`, inputInteractionIds: [], conditions: [] }],
  };
}
