import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, StrictMode, useState, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { api } from '../../../api';
import { useStoryRealtime } from '../../../hooks/useStoryRealtime';
import { useStoryPersistenceLifecycle } from './useStoryPersistenceLifecycle';
import { loadStoryEditorProjection } from './storyEditorLoader';

vi.mock('../../../api', () => ({
  api: {
    getStory: vi.fn(),
  },
}));

vi.mock('../../../hooks/useStoryRealtime', () => ({
  useStoryRealtime: vi.fn(() => 'live'),
}));

vi.mock('./storyEditorLoader', () => ({
  loadStoryEditorProjection: vi.fn(),
}));

describe('story persistence lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useStoryRealtime).mockReturnValue('live');
    vi.mocked(loadStoryEditorProjection).mockImplementation(async (storyId, onProgress) => {
      const story = await api.getStory(storyId);
      onProgress?.({ story, phase: 'ready' });
      return story;
    });
  });

  it('loads the story into the single parent-owned state and resets save feedback', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();

    await waitFor(() => expect(result.current.story?.id).toBe('story-1'));

    expect(result.current.error).toBe('');
    expect(result.current.saveStatus).toBe('idle');
    expect(useStoryRealtime).toHaveBeenLastCalledWith('story-1', true, expect.any(Function), 1);
  });

  it('starts one initial projection load when Strict Mode replays effects', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(StrictMode, undefined, children);
    const { result } = renderHook(
      () => {
        const [story, setStory] = useState<Story>();
        return { story, ...useStoryPersistenceLifecycle({ storyId: 'story-1', story, setStory }) };
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.story?.id).toBe('story-1'));

    expect(loadStoryEditorProjection).toHaveBeenCalledOnce();
  });

  it('tracks successful and failed saves without owning another Story state', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());

    let saved: string | undefined;
    await act(async () => {
      saved = await result.current.trackSave(async () => 'saved-value');
    });
    expect(saved).toBe('saved-value');
    expect(result.current.saveStatus).toBe('saved');

    let failed: string | undefined;
    await act(async () => {
      failed = await result.current.trackSave<string>(async () => {
        throw new Error('Save rejected');
      });
    });
    expect(failed).toBeUndefined();
    expect(result.current).toMatchObject({ error: 'Save rejected', saveStatus: 'error' });
  });

  it('keeps a concurrent save batch pending until every response completes', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());

    let resolveSlowSave: ((value: string) => void) | undefined;
    const slowOperation = new Promise<string>((resolve) => {
      resolveSlowSave = resolve;
    });
    let slowSave: Promise<string | undefined> | undefined;
    act(() => {
      slowSave = result.current.trackSave(() => slowOperation);
    });

    await act(async () => {
      await result.current.trackSave(async () => 'fast value');
    });
    expect(result.current.saveStatus).toBe('saving');

    await act(async () => {
      resolveSlowSave?.('slow value');
      await slowSave;
    });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('keeps an earlier concurrent failure visible after a later save succeeds', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());

    let rejectSlowSave: ((reason: Error) => void) | undefined;
    const slowOperation = new Promise<string>((_, reject) => {
      rejectSlowSave = reject;
    });
    let slowSave: Promise<string | undefined> | undefined;
    act(() => {
      slowSave = result.current.trackSave(() => slowOperation);
    });

    await act(async () => {
      await result.current.trackSave(async () => 'fast value');
    });
    expect(result.current.saveStatus).toBe('saving');

    await act(async () => {
      rejectSlowSave?.(new Error('Earlier save failed'));
      await slowSave;
    });
    expect(result.current).toMatchObject({
      error: 'Earlier save failed',
      saveStatus: 'error',
    });
  });

  it('defers realtime reloads until a local edit finishes', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());
    vi.mocked(api.getStory).mockClear();
    vi.mocked(api.getStory).mockResolvedValue({ ...storyFixture(), title: 'Remote title' });
    const invalidate = vi.mocked(useStoryRealtime).mock.calls.at(-1)?.[2];
    if (!invalidate) throw new Error('Expected a realtime callback');

    act(() => result.current.beginLocalEdit());
    act(() => invalidate('changed'));
    expect(api.getStory).not.toHaveBeenCalled();

    act(() => result.current.endLocalEdit());
    await waitFor(() => expect(result.current.story?.title).toBe('Remote title'));
    expect(api.getStory).toHaveBeenCalledOnce();
  });

  it('does not replace a newer local revision with an older realtime projection', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());

    let resolveRefresh: ((story: Story) => void) | undefined;
    vi.mocked(loadStoryEditorProjection).mockImplementationOnce(
      () =>
        new Promise<Story>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const invalidate = vi.mocked(useStoryRealtime).mock.calls.at(-1)?.[2];
    if (!invalidate) throw new Error('Expected a realtime callback');

    act(() => invalidate('changed'));
    await waitFor(() => expect(resolveRefresh).toBeDefined());
    act(() => {
      result.current.setStory({ ...storyFixture(), revision: 3, title: 'Latest local state' });
      resolveRefresh?.({ ...storyFixture(), revision: 2, title: 'Stale projection' });
    });
    await act(async () => Promise.resolve());

    expect(result.current.story).toMatchObject({ revision: 3, title: 'Latest local state' });
  });

  it('applies trigger tombstones to complete incoming story responses', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());
    result.current.deletedTriggerIdsRef.current.add('alternative-trigger');

    const merged = result.current.mergeIncomingStory(storyFixture(), storyFixture());

    expect(merged.interactions[1].triggers.map(({ id }) => id)).toEqual(['child-trigger']);
  });

  it('ignores every late progress and completion response from a previous Story route', async () => {
    let resolveFirst: ((story: Story) => void) | undefined;
    let reportFirstProgress: ((story: Story) => void) | undefined;
    const firstStory = storyFixture('story-1', 'First Story');
    const secondStory = storyFixture('story-2', 'Second Story');
    vi.mocked(loadStoryEditorProjection).mockImplementation((storyId, onProgress) => {
      if (storyId === 'story-2') {
        onProgress?.({ story: secondStory, phase: 'ready' });
        return Promise.resolve(secondStory);
      }
      return new Promise<Story>((resolve) => {
        resolveFirst = resolve;
        reportFirstProgress = (story) => onProgress?.({ story, phase: 'interactions' });
      });
    });

    const { result, rerender } = renderHook(
      ({ storyId }) => {
        const [story, setStory] = useState<Story>();
        return { story, ...useStoryPersistenceLifecycle({ storyId, story, setStory }) };
      },
      { initialProps: { storyId: 'story-1' } },
    );

    await waitFor(() => expect(reportFirstProgress).toBeDefined());
    rerender({ storyId: 'story-2' });
    await waitFor(() => expect(result.current.story?.id).toBe('story-2'));

    act(() => {
      reportFirstProgress?.(firstStory);
      resolveFirst?.(firstStory);
    });
    await act(async () => Promise.resolve());

    expect(result.current.story).toMatchObject({ id: 'story-2', title: 'Second Story' });
  });

  it('discards a save result that settles after the editor moves to another Story', async () => {
    const firstStory = storyFixture('story-1', 'First Story');
    const secondStory = storyFixture('story-2', 'Second Story');
    vi.mocked(api.getStory).mockImplementation((storyId) =>
      Promise.resolve(storyId === 'story-1' ? firstStory : secondStory),
    );
    let resolveFirstSave: ((value: Story) => void) | undefined;
    const firstSave = new Promise<Story>((resolve) => {
      resolveFirstSave = resolve;
    });
    const { result, rerender } = renderHook(
      ({ storyId }) => {
        const [story, setStory] = useState<Story>();
        return { story, ...useStoryPersistenceLifecycle({ storyId, story, setStory }) };
      },
      { initialProps: { storyId: 'story-1' } },
    );
    await waitFor(() => expect(result.current.story?.id).toBe('story-1'));

    let trackedSave: Promise<Story | undefined> | undefined;
    act(() => {
      trackedSave = result.current.trackSave(() => firstSave);
    });
    expect(result.current.saveStatus).toBe('saving');

    rerender({ storyId: 'story-2' });
    await waitFor(() => expect(result.current.story?.id).toBe('story-2'));

    let saveResult: Story | undefined;
    await act(async () => {
      resolveFirstSave?.(firstStory);
      saveResult = await trackedSave;
    });

    expect(saveResult).toBeUndefined();
    expect(result.current.story).toMatchObject({ id: 'story-2', title: 'Second Story' });
    expect(result.current.saveStatus).toBe('idle');
  });

  it('ignores unresolved load progress and completion after unmounting', async () => {
    let resolveLoad: ((story: Story) => void) | undefined;
    let reportProgress: ((story: Story) => void) | undefined;
    vi.mocked(loadStoryEditorProjection).mockImplementation(
      (_storyId, onProgress) =>
        new Promise<Story>((resolve) => {
          resolveLoad = resolve;
          reportProgress = (story) => onProgress?.({ story, phase: 'interactions' });
        }),
    );
    const setStory = vi.fn();
    const { unmount } = renderHook(() =>
      useStoryPersistenceLifecycle({ storyId: 'story-1', story: undefined, setStory }),
    );

    await waitFor(() => expect(resolveLoad).toBeDefined());
    unmount();
    act(() => {
      reportProgress?.(storyFixture());
      resolveLoad?.(storyFixture());
    });
    await act(async () => Promise.resolve());

    expect(setStory).not.toHaveBeenCalled();
  });
});

function renderLifecycle() {
  return renderHook(() => {
    const [story, setStory] = useState<Story>();
    return {
      story,
      setStory,
      ...useStoryPersistenceLifecycle({ storyId: 'story-1', story, setStory }),
    };
  });
}

function storyFixture(id = 'story-1', title = 'Story'): Story {
  return {
    id,
    revision: 1,
    title,
    capabilities: {
      canRead: true,
      canEdit: true,
      canManage: true,
      canComment: true,
    },
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'child',
        title: 'Child',
        body: '',
        position: { x: 0, y: 200 },
        triggers: [
          { id: 'child-trigger', inputInteractionIds: ['root'], conditions: [] },
          { id: 'alternative-trigger', inputInteractionIds: ['root'], conditions: [] },
        ],
      },
    ],
  };
}
