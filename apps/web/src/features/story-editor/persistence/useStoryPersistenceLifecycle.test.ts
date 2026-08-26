import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { api } from '../../../api';
import { useStoryRealtime } from '../../../hooks/useStoryRealtime';
import { useStoryPersistenceLifecycle } from './useStoryPersistenceLifecycle';

vi.mock('../../../api', () => ({
  api: {
    getStory: vi.fn(),
  },
}));

vi.mock('../../../hooks/useStoryRealtime', () => ({
  useStoryRealtime: vi.fn(() => 'live'),
}));

describe('story persistence lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useStoryRealtime).mockReturnValue('live');
  });

  it('loads the story into the single parent-owned state and resets save feedback', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();

    await waitFor(() => expect(result.current.story?.id).toBe('story-1'));

    expect(result.current.error).toBe('');
    expect(result.current.saveStatus).toBe('idle');
    expect(useStoryRealtime).toHaveBeenLastCalledWith('story-1', true, expect.any(Function));
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

  it('applies trigger tombstones to complete incoming story responses', async () => {
    vi.mocked(api.getStory).mockResolvedValue(storyFixture());
    const { result } = renderLifecycle();
    await waitFor(() => expect(result.current.story).toBeDefined());
    result.current.deletedTriggerIdsRef.current.add('alternative-trigger');

    const merged = result.current.mergeIncomingStory(storyFixture(), storyFixture());

    expect(merged.interactions[1].triggers.map(({ id }) => id)).toEqual(['child-trigger']);
  });
});

function renderLifecycle() {
  return renderHook(() => {
    const [story, setStory] = useState<Story>();
    return {
      story,
      ...useStoryPersistenceLifecycle({ storyId: 'story-1', story, setStory }),
    };
  });
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    revision: 1,
    title: 'Story',
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
