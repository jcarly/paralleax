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
    updateStoryGraphPositions: vi.fn(),
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

    await expect(
      harness.actions.createChildFromInteraction('root', { x: 300, y: 400 }),
    ).resolves.toBe('created');

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

  it('registers the exact reversible graph patch after a grouped position save', async () => {
    const trackedOptions: Parameters<TrackStorySave>[1][] = [];
    const trackSave: TrackStorySave = async (operation, options) => {
      trackedOptions.push(options);
      return operation();
    };
    const harness = createHarness(trackSave);
    vi.mocked(api.updateStoryGraphPositions).mockResolvedValue(metadata(2));

    await harness.actions.saveGraphPositions({
      interactionUpdates: [{ interactionId: 'root', position: { x: 300, y: 200 } }],
      triggerUpdates: [
        {
          interactionId: 'child',
          triggerIds: ['child-trigger'],
          position: { x: 310, y: 360 },
        },
      ],
    });

    expect(trackedOptions).toEqual([
      {
        graphHistoryChange: {
          undo: {
            interactionUpdates: [{ interactionId: 'root', position: { x: 0, y: 0 } }],
            triggerUpdates: [{ interactionId: 'child', triggerIds: ['child-trigger'] }],
          },
          redo: {
            interactionUpdates: [{ interactionId: 'root', position: { x: 300, y: 200 } }],
            triggerUpdates: [
              {
                interactionId: 'child',
                triggerIds: ['child-trigger'],
                position: { x: 310, y: 360 },
              },
            ],
          },
        },
      },
    ]);
    expect(harness.story()).toMatchObject(metadata(2));
    expect(harness.story().interactions[0].position).toEqual({ x: 300, y: 200 });
    expect(harness.story().interactions[1].triggers[0].position).toEqual({ x: 310, y: 360 });
  });

  it('deduplicates trigger inputs and clears matching deletion tombstones', async () => {
    const harness = createHarness();
    harness.deletedTriggerInputKeysRef.current.add('child-trigger:root');
    vi.mocked(api.updateTrigger).mockResolvedValue({
      interactionId: 'child',
      trigger: {
        id: 'child-trigger',
        inputInteractionIds: ['root'],
        conditions: [],
        timerSeconds: 4,
      },
      ...metadata(2),
    });

    await harness.actions.saveTrigger('child', 'child-trigger', {
      inputInteractionIds: ['root', 'root'],
      timerSeconds: 4,
    });

    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'child', 'child-trigger', {
      inputInteractionIds: ['root'],
      timerSeconds: 4,
    });
    expect(harness.deletedTriggerInputKeysRef.current).not.toContain('child-trigger:root');
    expect(harness.story().interactions[1].triggers[0].timerSeconds).toBe(4);
  });

  it('moves every existing trigger in a group and ignores empty or unknown groups', async () => {
    const harness = createHarness();
    vi.mocked(api.updateTrigger).mockImplementation(
      async (_storyId, interactionId, triggerId, patch) => ({
        interactionId,
        trigger: {
          ...harness
            .story()
            .interactions.find(({ id }) => id === interactionId)!
            .triggers.find(({ id }) => id === triggerId)!,
          ...patch,
        },
        ...metadata(2),
      }),
    );

    await harness.actions.moveTrigger('child', [], { x: 1, y: 2 });
    await harness.actions.moveTrigger('missing', ['missing-trigger'], { x: 1, y: 2 });
    await harness.actions.moveTrigger('child', ['child-trigger', 'alternative-trigger'], {
      x: 120,
      y: 180,
    });

    expect(api.updateTrigger).toHaveBeenCalledTimes(2);
    expect(harness.story().interactions[1].triggers.map(({ position }) => position)).toEqual([
      { x: 120, y: 180 },
      { x: 120, y: 180 },
    ]);
  });

  it('does not save empty, unchanged, or unavailable graph positions', async () => {
    const harness = createHarness();
    await harness.actions.saveGraphPositions({ interactionUpdates: [], triggerUpdates: [] });
    await harness.actions.saveGraphPositions({
      interactionUpdates: [{ interactionId: 'root', position: { x: 0, y: 0 } }],
      triggerUpdates: [],
    });
    await createHarness(undefined, null).actions.saveGraphPositions({
      interactionUpdates: [{ interactionId: 'root', position: { x: 2, y: 3 } }],
      triggerUpdates: [],
    });

    expect(api.updateStoryGraphPositions).not.toHaveBeenCalled();
  });

  it('deletes trigger inputs through the existing trigger update path', async () => {
    const harness = createHarness();
    vi.mocked(api.updateTrigger).mockResolvedValue({
      interactionId: 'child',
      trigger: { id: 'child-trigger', inputInteractionIds: [], conditions: [] },
      ...metadata(2),
    });

    await harness.actions.deleteTriggerInput('missing', 'missing', 'root');
    await harness.actions.deleteTriggerInput('child', 'child-trigger', 'root');

    expect(harness.deletedTriggerInputKeysRef.current).toContain('child-trigger:root');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'child', 'child-trigger', {
      inputInteractionIds: [],
    });
  });

  it('connects new and existing triggers while rejecting invalid connections', async () => {
    const harness = createHarness();
    vi.mocked(api.addTrigger).mockResolvedValue({
      interactionId: 'child',
      trigger: { id: 'created-trigger', inputInteractionIds: ['root'], conditions: [] },
      ...metadata(2),
    });
    vi.mocked(api.updateTrigger).mockResolvedValue({
      interactionId: 'child',
      trigger: {
        id: 'alternative-trigger',
        inputInteractionIds: ['root', 'third'],
        conditions: [],
      },
      ...metadata(3),
    });

    await harness.actions.connectInteractions({
      source: 'root',
      target: 'missing',
      sourceHandle: null,
      targetHandle: 'new-trigger-input',
    });
    await harness.actions.connectInteractions({
      source: 'root',
      target: 'child',
      sourceHandle: null,
      targetHandle: 'new-trigger-input',
    });
    await harness.actions.connectToExistingTrigger('missing', 'child', 'alternative-trigger');
    await harness.actions.connectToExistingTrigger('third', 'child', 'alternative-trigger');

    expect(api.addTrigger).toHaveBeenCalledOnce();
    expect(api.updateTrigger).toHaveBeenCalledOnce();
    expect(harness.story().interactions[1].triggers.map(({ id }) => id)).toContain(
      'created-trigger',
    );
  });

  it('creates roots, children, parents, and deletes interactions through compact results', async () => {
    const harness = createHarness();
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce({
        interaction: interaction('new-root', 'New root', { x: 500, y: 0 }),
        ...metadata(2),
      })
      .mockResolvedValueOnce({
        interaction: interaction('new-child', 'New child', { x: 0, y: 400 }),
        ...metadata(3),
      })
      .mockResolvedValueOnce({
        interaction: interaction('new-parent', 'New parent', { x: 0, y: -200 }),
        ...metadata(4),
      });
    vi.mocked(api.addTrigger).mockResolvedValue({
      interactionId: 'root',
      trigger: { id: 'parent-trigger', inputInteractionIds: ['new-parent'], conditions: [] },
      ...metadata(5),
    });
    vi.mocked(api.deleteInteraction).mockResolvedValue({
      ...storyFixture(),
      revision: 6,
      updatedAt: metadata(6).updatedAt,
      interactions: storyFixture().interactions.filter(({ id }) => id !== 'child'),
    });

    await expect(harness.actions.createRoot({ x: 500, y: 0 })).resolves.toBe('new-root');
    await expect(harness.actions.createChild(harness.story().interactions[0])).resolves.toBe(
      'new-child',
    );
    await expect(
      harness.actions.createParentForInteraction('root', { x: 0, y: -200 }),
    ).resolves.toBe('new-parent');
    expect(harness.story().interactions.some(({ id }) => id === 'new-parent')).toBe(true);
    await harness.actions.deleteInteraction('child');

    expect(harness.story().interactions.some(({ id }) => id === 'child')).toBe(false);
  });

  it('preserves current triggers when a legacy full-story patch response is stale', async () => {
    const harness = createHarness();
    const response = storyFixture();
    response.revision = 2;
    response.updatedAt = metadata(2).updatedAt;
    response.interactions[1].triggers = [];
    vi.mocked(api.updateInteraction).mockResolvedValue(response);

    await harness.actions.patchInteraction('child', { title: 'Locally edited' });

    expect(harness.story().interactions[1].title).toBe('Locally edited');
    expect(harness.story().interactions[1].triggers).toHaveLength(2);
  });

  it('keeps optimistic mutations when tracked saves do not produce a result', async () => {
    const trackSave: TrackStorySave = async () => undefined;
    const harness = createHarness(trackSave);

    await harness.actions.saveTrigger('child', 'child-trigger', { timerSeconds: 8 });
    await harness.actions.deleteTrigger('child', 'alternative-trigger');
    await harness.actions.patchInteraction('root', { title: 'Optimistic root' });
    await expect(harness.actions.createGraphDecoration('frame', { x: 1, y: 2 })).resolves.toBe(
      undefined,
    );
    await harness.actions.updateGraphDecoration('missing', { position: { x: 3, y: 4 } });
    await harness.actions.deleteGraphDecoration('missing');

    expect(harness.story().interactions[0].title).toBe('Optimistic root');
    expect(harness.story().interactions[1].triggers).toHaveLength(1);
  });

  it('does not recreate graph state when async results arrive after it is unloaded', async () => {
    const harness = createHarness(undefined, null);
    vi.mocked(api.updateTrigger).mockResolvedValue({
      interactionId: 'child',
      trigger: { id: 'child-trigger', inputInteractionIds: [], conditions: [] },
      ...metadata(2),
    });
    vi.mocked(api.createInteraction).mockResolvedValue({
      interaction: interaction('created', 'Created', { x: 0, y: 0 }),
      ...metadata(2),
    });
    vi.mocked(api.updateInteraction).mockResolvedValue({
      interaction: interaction('root', 'Updated', { x: 0, y: 0 }),
      ...metadata(2),
    });
    vi.mocked(api.createGraphDecoration).mockResolvedValue({
      decoration: {
        id: 'frame',
        kind: 'frame',
        position: { x: 1, y: 2 },
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
        position: { x: 3, y: 4 },
        width: 420,
        height: 240,
        color: '#5b6ee1',
      },
      ...metadata(2),
    });

    await harness.actions.saveTrigger('child', 'child-trigger', { timerSeconds: 2 });
    await expect(harness.actions.createRoot()).resolves.toBe('created');
    await harness.actions.patchInteraction('root', { title: 'Updated' });
    await expect(harness.actions.createGraphDecoration('frame', { x: 1, y: 2 })).resolves.toBe(
      'frame',
    );
    await harness.actions.updateGraphDecoration('frame', { position: { x: 3, y: 4 } });
    await harness.actions.moveTrigger('child', ['child-trigger'], { x: 5, y: 6 });
    await harness.actions.createChild(interaction('parent', 'Parent', { x: 0, y: 0 }));
    await harness.actions.createChildFromInteraction('root');
    await harness.actions.createParentForInteraction('root');
    await harness.actions.connectInteractions({
      source: 'root',
      target: 'child',
      sourceHandle: null,
      targetHandle: 'new-trigger-input',
    });
    await harness.actions.connectToExistingTrigger('root', 'child', 'child-trigger');

    expect(harness.current()).toBeUndefined();
  });
});

function createHarness(
  trackSave: TrackStorySave = async (operation) => operation(),
  initialStory: Story | null = storyFixture(),
) {
  let story: Story | undefined = initialStory ?? undefined;
  const setStory: StoryStateSetter = (next) => {
    story = typeof next === 'function' ? next(story) : next;
  };
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
    deletedTriggerInputKeysRef,
    current: () => story,
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
      interaction('third', 'Third', { x: 300, y: 0 }),
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
