import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

function jsonResponse(body: unknown, init: Partial<Response> = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('api client', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('calls story endpoints with JSON headers and bodies', async () => {
    const story = {
      id: 'story-1',
      title: 'Story',
      interactions: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    fetchMock.mockResolvedValue(jsonResponse(story));

    await expect(api.createStory('New')).resolves.toEqual(story);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ title: 'New' }),
    });

    await api.createDemoStory();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/demo', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({}),
    });

    await api.renameStory('story-1', 'Renamed');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ title: 'Renamed' }),
    });

    await api.deleteStory('story-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    });
  });

  it('calls interaction and trigger endpoints', async () => {
    const story = {
      id: 'story-1',
      title: 'Story',
      interactions: [],
      createdAt: 'now',
      updatedAt: 'now',
    };
    fetchMock.mockResolvedValue(jsonResponse(story));

    await api.listStories();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories', {
      headers: { 'Content-Type': 'application/json' },
    });

    await api.getStory('story-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1', {
      headers: { 'Content-Type': 'application/json' },
    });

    await api.createInteraction('story-1', { parentId: 'parent-1', position: { x: 1, y: 2 } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/interactions', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ parentId: 'parent-1', position: { x: 1, y: 2 } }),
    });

    await api.updateInteraction('story-1', 'interaction-1', { title: 'Title' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/interactions/interaction-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ title: 'Title' }),
    });

    await api.deleteInteraction('story-1', 'interaction-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/interactions/interaction-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    });

    await api.addTrigger('story-1', 'interaction-1');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/interactions/interaction-1/triggers',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );

    await api.updateTrigger('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: ['source-1'],
      conditions: [{ interactionId: 'source-1', hasBeenVisited: true }],
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/interactions/interaction-1/triggers/trigger-1',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        body: JSON.stringify({
          inputInteractionIds: ['source-1'],
          conditions: [{ interactionId: 'source-1', hasBeenVisited: true }],
        }),
      },
    );

    await api.deleteTrigger('story-1', 'interaction-1', 'trigger-1');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/interactions/interaction-1/triggers/trigger-1',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      },
    );
  });

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse('', { status: 204 }));

    await expect(api.deleteStory('story-1')).resolves.toBeUndefined();
  });

  it('throws response text for failed requests', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Bad request'),
      json: vi.fn(),
    });

    await expect(api.getStory('story-1')).rejects.toThrow('Bad request');
  });
});
