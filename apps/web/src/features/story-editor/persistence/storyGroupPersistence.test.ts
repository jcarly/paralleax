import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { api } from '../../../api';
import { useStoryGroupPersistence } from './storyGroupPersistence';

vi.mock('../../../api', () => ({
  api: { createGroup: vi.fn(), updateGroup: vi.fn(), deleteGroup: vi.fn() },
}));

describe('story group persistence', () => {
  it('applies update and deletion results without losing unrelated newer Story state', async () => {
    const initial = storyFixture();
    initial.revision = 10;
    initial.groups = [
      { id: 'parent', title: 'Parent', interactionIds: ['interaction-1'] },
      { id: 'child', title: 'Child', interactionIds: [], parentGroupId: 'parent' },
      { id: 'unrelated', title: 'Newer unrelated group', interactionIds: [] },
    ];
    vi.mocked(api.updateGroup).mockResolvedValue({
      revision: 2,
      updatedAt: initial.updatedAt,
      group: { ...initial.groups[0], title: 'Renamed' },
    });
    vi.mocked(api.deleteGroup).mockResolvedValue({
      revision: 3,
      updatedAt: initial.updatedAt,
      groupId: 'parent',
    });
    const { result } = renderHook(() => {
      const [story, setStory] = useState<Story | undefined>(initial);
      return {
        story,
        actions: useStoryGroupPersistence({
          storyId: initial.id,
          setStory,
          trackSave: async (operation) => operation(),
        }),
      };
    });
    await act(async () => {
      await result.current.actions.updateGroup('parent', { title: 'Renamed' });
    });
    expect(result.current.story?.groups![0].title).toBe('Renamed');
    await act(async () => {
      await result.current.actions.deleteGroup('parent');
    });
    expect(result.current.story?.revision).toBe(10);
    expect(result.current.story?.groups).toEqual([
      { id: 'child', title: 'Child', interactionIds: [] },
      { id: 'unrelated', title: 'Newer unrelated group', interactionIds: [] },
    ]);
    expect(result.current.story?.interactions).toEqual(initial.interactions);
  });

  it('projects transfers into both the source and target Groups immediately', async () => {
    const initial = storyFixture();
    initial.groups = [
      { id: 'source', title: 'Source', interactionIds: ['interaction-1', 'interaction-2'] },
      { id: 'target', title: 'Target', interactionIds: [], parentGroupId: 'source' },
    ];
    const group = {
      id: 'target',
      title: 'Target',
      interactionIds: ['interaction-1'],
      parentGroupId: 'source',
    };
    vi.mocked(api.updateGroup).mockResolvedValue({
      revision: 2,
      updatedAt: initial.updatedAt,
      group,
    });
    vi.mocked(api.createGroup).mockResolvedValue({
      revision: 3,
      updatedAt: initial.updatedAt,
      group: { id: 'new', title: 'New', interactionIds: ['interaction-1'] },
    });
    const { result } = renderHook(() => {
      const [story, setStory] = useState<Story | undefined>(initial);
      return {
        story,
        actions: useStoryGroupPersistence({
          storyId: initial.id,
          setStory,
          trackSave: async (operation) => operation(),
        }),
      };
    });
    await act(async () => {
      await result.current.actions.updateGroup('target', { interactionIds: ['interaction-1'] });
    });
    expect(result.current.story?.groups![0].interactionIds).toEqual(['interaction-2']);
    expect(result.current.story?.groups![1]).toEqual(group);
    await act(async () => {
      await result.current.actions.createGroup('New', ['interaction-1']);
    });
    expect(result.current.story?.groups![1].interactionIds).toEqual([]);
    expect(result.current.story?.groups![2].interactionIds).toEqual(['interaction-1']);
  });

  it('keeps the Story intact when a save fails', async () => {
    const initial = storyFixture();
    const { result } = renderHook(() => {
      const [story, setStory] = useState<Story | undefined>(initial);
      return {
        story,
        actions: useStoryGroupPersistence({
          storyId: initial.id,
          setStory,
          trackSave: async () => undefined,
        }),
      };
    });
    await act(async () => {
      expect(await result.current.actions.createGroup('Failed', ['interaction-1'])).toBe(false);
      expect(await result.current.actions.updateGroup('missing', { title: 'Failed' })).toBe(false);
      expect(await result.current.actions.deleteGroup('missing')).toBe(false);
    });
    expect(result.current.story).toBe(initial);
  });

  it('persists a selected Interaction group and applies the compact result locally', async () => {
    vi.mocked(api.createGroup).mockResolvedValue({
      revision: 2,
      updatedAt: '2026-10-06T10:00:00.000Z',
      group: {
        id: 'group-1',
        title: 'Opening',
        interactionIds: ['interaction-1', 'interaction-2'],
      },
    });
    const { result } = renderHook(() => {
      const [story, setStory] = useState<Story | undefined>(storyFixture());
      if (!story) throw new Error('Expected the story fixture to be available');
      const actions = useStoryGroupPersistence({
        storyId: story.id,
        setStory,
        trackSave: async (operation) => operation(),
      });
      return { story, actions };
    });

    let created = false;
    await act(async () => {
      created = await result.current.actions.createGroup('Opening', [
        'interaction-1',
        'interaction-2',
      ]);
    });

    expect(created).toBe(true);
    expect(api.createGroup).toHaveBeenCalledWith('story-1', {
      title: 'Opening',
      interactionIds: ['interaction-1', 'interaction-2'],
    });
    expect(result.current.story).toMatchObject({
      revision: 2,
      groups: [
        { id: 'group-1', title: 'Opening', interactionIds: ['interaction-1', 'interaction-2'] },
      ],
    });
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    interactions: [
      { id: 'interaction-1', title: 'One', body: '', position: { x: 0, y: 0 }, triggers: [] },
      { id: 'interaction-2', title: 'Two', body: '', position: { x: 0, y: 100 }, triggers: [] },
    ],
    createdAt: '2026-10-06T09:00:00.000Z',
    updatedAt: '2026-10-06T09:00:00.000Z',
  };
}
