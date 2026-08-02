import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

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

    await api.updateStory('story-1', { startDateTime: '2026-07-27T09:30' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ startDateTime: '2026-07-27T09:30' }),
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

    fetchMock.mockResolvedValueOnce(jsonResponse({ progress: null }));
    await expect(api.getReaderProgress('story-1')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/progress', {
      headers: { 'Content-Type': 'application/json' },
    });

    await api.saveReaderProgress('story-1', {
      journeyInteractionIds: ['interaction-1', 'interaction-1'],
      ownedItemIds: ['item-1'],
    });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/progress', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({
        journeyInteractionIds: ['interaction-1', 'interaction-1'],
        ownedItemIds: ['item-1'],
      }),
    });

    await api.deleteReaderProgress('story-1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/progress', {
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
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

    await api.createStatDefinition('story-1', { name: 'Trust' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/stat-definitions', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ name: 'Trust' }),
    });

    await api.updateStatDefinition('story-1', 'definition-1', { name: 'Confidence' });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/stat-definitions/definition-1',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        body: JSON.stringify({ name: 'Confidence' }),
      },
    );

    await api.createCharacterStat('story-1', 'character-1', {
      statDefinitionId: 'definition-1',
      initialValue: 2,
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/characters/character-1/stats',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ statDefinitionId: 'definition-1', initialValue: 2 }),
      },
    );

    await api.updateCharacterStat('story-1', 'character-1', 'stat-1', { initialValue: 3 });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/characters/character-1/stats/stat-1',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        body: JSON.stringify({ initialValue: 3 }),
      },
    );

    await api.createItemDefinition('story-1', {
      name: 'Key',
      description: 'A brass key.',
    });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/item-definitions', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ name: 'Key', description: 'A brass key.' }),
    });

    await api.updateItemDefinition('story-1', 'item-definition-1', {
      name: 'Archive key',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/item-definitions/item-definition-1',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
        body: JSON.stringify({ name: 'Archive key' }),
      },
    );

    await api.createCharacterItem('story-1', 'character-1', {
      itemDefinitionId: 'item-definition-1',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/stories/story-1/characters/character-1/items',
      {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ itemDefinitionId: 'item-definition-1' }),
      },
    );

    await api.moveItemInstance('story-1', 'item-1', {
      parentItemId: 'bag-1',
      relationshipType: 'contained',
    });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/stories/story-1/items/item-1/placement', {
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      body: JSON.stringify({ parentItemId: 'bag-1', relationshipType: 'contained' }),
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

  it('preserves stable API error metadata for support and recovery', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          status: 409,
          code: 'STORY_REVISION_CONFLICT',
          message: 'The story changed elsewhere.',
          requestId: 'request-1',
        },
        { ok: false, status: 409 },
      ),
    );

    const error = await api.getStory('story-1').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: 'The story changed elsewhere.',
      status: 409,
      code: 'STORY_REVISION_CONFLICT',
      requestId: 'request-1',
    });
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
