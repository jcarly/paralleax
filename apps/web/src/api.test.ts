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

    const triggerInput = {
      inputInteractionIds: ['source-1'],
      conditions: [{ interactionId: 'source-1', hasBeenVisited: true }],
    };
    await api.addTrigger('story-1', 'interaction-1', triggerInput);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/interactions/interaction-1/triggers',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify(triggerInput),
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

    await api.createLocation('story-1', { name: 'Harbor', description: '' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/locations', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ name: 'Harbor', description: '' }),
    });

    await api.updateLocation('story-1', 'location-1', { name: 'Old harbor' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/locations/location-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ name: 'Old harbor' }),
    });

    await api.createCharacter('story-1', { name: 'Mira', description: '' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/characters', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ name: 'Mira', description: '' }),
    });

    await api.updateCharacter('story-1', 'character-1', { name: 'Mira Vale' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/characters/character-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ name: 'Mira Vale' }),
    });
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

  it('signals an expired session for protected requests only', async () => {
    const expired = vi.fn();
    window.addEventListener('paralleax:session-expired', expired);
    fetchMock.mockResolvedValue(
      jsonResponse('Authentication required', { ok: false, status: 401 }),
    );

    await expect(api.listStories()).rejects.toThrow('Authentication required');
    expect(expired).toHaveBeenCalledOnce();

    expired.mockClear();
    await expect(api.login('author@example.com', 'wrong password')).rejects.toThrow();
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener('paralleax:session-expired', expired);
  });
});
