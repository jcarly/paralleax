import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { api } from '../../../api';
import { useStoryGroupPersistence } from './storyGroupPersistence';

vi.mock('../../../api', () => ({ api: { createGroup: vi.fn() } }));

describe('story group persistence', () => {
  it('persists a selected Interaction group and applies the compact result locally', async () => {
    vi.mocked(api.createGroup).mockResolvedValue({
      revision: 2,
      updatedAt: '2026-10-06T10:00:00.000Z',
      group: { id: 'group-1', title: 'Opening', interactionIds: ['interaction-1', 'interaction-2'] },
    });
    const { result } = renderHook(() => {
      const [story, setStory] = useState(storyFixture());
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
      groups: [{ id: 'group-1', title: 'Opening', interactionIds: ['interaction-1', 'interaction-2'] }],
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
