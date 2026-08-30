import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { api } from '../../../api';
import type { TrackStorySave } from '../persistence/storyPersistenceTypes';
import { useStoryHistory } from './useStoryHistory';

vi.mock('../../../api', () => ({
  api: {
    getStoryHistory: vi.fn(),
    undoStoryChange: vi.fn(),
    redoStoryChange: vi.fn(),
    getStory: vi.fn(),
  },
}));

const trackSave: TrackStorySave = async (operation) => operation();

describe('useStoryHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getStoryHistory).mockResolvedValue({
      entries: [],
      canUndo: false,
      canRedo: false,
    });
  });

  it('resynchronizes remote revisions but skips revisions already reported by a local save', async () => {
    const { result, rerender } = renderHook(
      ({ story }) =>
        useStoryHistory({
          storyId: 'story-1',
          story,
          replaceStory: vi.fn(),
          applyGraphPositions: vi.fn(),
          trackSave,
        }),
      { initialProps: { story: storyAtRevision(1) } },
    );
    await waitFor(() => expect(api.getStoryHistory).toHaveBeenCalledTimes(1));

    rerender({ story: storyAtRevision(2) });
    await waitFor(() => expect(api.getStoryHistory).toHaveBeenCalledTimes(2));

    act(() => result.current.markLocalChange(3));
    rerender({ story: storyAtRevision(3) });
    await Promise.resolve();

    expect(api.getStoryHistory).toHaveBeenCalledTimes(2);
    expect(result.current.history.canUndo).toBe(true);
  });

  it('applies graph-only history responses without replacing the complete Story', async () => {
    const replaceStory = vi.fn();
    const applyGraphPositions = vi.fn();
    vi.mocked(api.undoStoryChange).mockResolvedValue({
      storyId: 'story-1',
      revision: 2,
      updatedAt: '2026-08-29T08:01:00.000Z',
      graphPositions: {
        interactionUpdates: [{ interactionId: 'interaction-1', position: { x: 100, y: 200 } }],
        triggerUpdates: [],
      },
      history: { entries: [], canUndo: false, canRedo: true },
    });
    const { result } = renderHook(() =>
      useStoryHistory({
        storyId: 'story-1',
        story: storyAtRevision(1),
        replaceStory,
        applyGraphPositions,
        trackSave,
      }),
    );

    await act(() => result.current.undo());

    expect(replaceStory).not.toHaveBeenCalled();
    expect(applyGraphPositions).toHaveBeenCalledWith(
      {
        interactionUpdates: [{ interactionId: 'interaction-1', position: { x: 100, y: 200 } }],
        triggerUpdates: [],
      },
      expect.objectContaining({ revision: 2 }),
    );
    expect(result.current.history.canRedo).toBe(true);
  });

  it('applies cached graph undo and redo patches before their server responses', async () => {
    const change = graphHistoryChange();
    const applyGraphPositions = vi.fn();
    let resolveUndo:
      | ((result: Awaited<ReturnType<typeof api.undoStoryChange>>) => void)
      | undefined;
    let resolveRedo:
      | ((result: Awaited<ReturnType<typeof api.redoStoryChange>>) => void)
      | undefined;
    vi.mocked(api.undoStoryChange).mockReturnValue(
      new Promise((resolve) => {
        resolveUndo = resolve;
      }),
    );
    vi.mocked(api.redoStoryChange).mockReturnValue(
      new Promise((resolve) => {
        resolveRedo = resolve;
      }),
    );
    const { result } = renderHook(() =>
      useStoryHistory({
        storyId: 'story-1',
        story: storyAtRevision(2),
        replaceStory: vi.fn(),
        applyGraphPositions,
        trackSave,
      }),
    );
    act(() => result.current.markLocalChange(2, change));

    let undoPromise: Promise<void> | undefined;
    act(() => {
      undoPromise = result.current.undo();
    });
    expect(applyGraphPositions).toHaveBeenCalledTimes(1);
    expect(applyGraphPositions).toHaveBeenLastCalledWith(change.undo);

    resolveUndo?.({
      storyId: 'story-1',
      revision: 3,
      updatedAt: '2026-08-29T08:02:00.000Z',
      graphPositions: change.undo,
      history: { entries: [], canUndo: false, canRedo: true },
    });
    await act(async () => undoPromise);

    applyGraphPositions.mockClear();
    let redoPromise: Promise<void> | undefined;
    act(() => {
      redoPromise = result.current.redo();
    });
    expect(applyGraphPositions).toHaveBeenCalledTimes(1);
    expect(applyGraphPositions).toHaveBeenLastCalledWith(change.redo);

    resolveRedo?.({
      storyId: 'story-1',
      revision: 4,
      updatedAt: '2026-08-29T08:03:00.000Z',
      graphPositions: change.redo,
      history: { entries: [], canUndo: true, canRedo: false },
    });
    await act(async () => redoPromise);

    expect(applyGraphPositions).toHaveBeenNthCalledWith(2, change.undo);
    expect(applyGraphPositions).toHaveBeenNthCalledWith(
      3,
      change.redo,
      expect.objectContaining({ revision: 4 }),
    );
  });

  it('rolls back an unconfirmed optimistic graph undo and reloads the Story', async () => {
    const change = graphHistoryChange();
    const applyGraphPositions = vi.fn();
    const replaceStory = vi.fn();
    const current = storyAtRevision(2);
    vi.mocked(api.undoStoryChange).mockRejectedValue(new Error('Undo conflict'));
    vi.mocked(api.getStory).mockResolvedValue(current);
    const trackFailedSave: TrackStorySave = async (operation) => {
      try {
        return await operation();
      } catch {
        return undefined;
      }
    };
    const { result } = renderHook(() =>
      useStoryHistory({
        storyId: 'story-1',
        story: current,
        replaceStory,
        applyGraphPositions,
        trackSave: trackFailedSave,
      }),
    );
    act(() => result.current.markLocalChange(2, change));

    await act(() => result.current.undo());

    expect(applyGraphPositions).toHaveBeenNthCalledWith(1, change.undo);
    expect(applyGraphPositions).toHaveBeenNthCalledWith(2, change.redo);
    expect(api.getStory).toHaveBeenCalledWith('story-1');
    expect(replaceStory).toHaveBeenCalledWith(current);
  });
});

function graphHistoryChange() {
  return {
    undo: {
      interactionUpdates: [
        { interactionId: 'interaction-1', position: { x: 0, y: 0 } },
      ],
      triggerUpdates: [],
    },
    redo: {
      interactionUpdates: [
        { interactionId: 'interaction-1', position: { x: 100, y: 200 } },
      ],
      triggerUpdates: [],
    },
  };
}

function storyAtRevision(revision: number): Story {
  return {
    id: 'story-1',
    revision,
    title: 'Story',
    createdAt: '2026-08-29T08:00:00.000Z',
    updatedAt: '2026-08-29T08:00:00.000Z',
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    interactions: [],
  };
}
