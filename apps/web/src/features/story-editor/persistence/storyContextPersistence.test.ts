import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { api } from '../../../api';
import { useStoryContextPersistence } from './storyContextPersistence';
import type { StoryStateSetter, TrackStorySave } from './storyPersistenceTypes';

vi.mock('../../../api', () => ({
  api: {
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    createStatDefinition: vi.fn(),
    updateStatDefinition: vi.fn(),
    createCharacterStat: vi.fn(),
    updateCharacterStat: vi.fn(),
    deleteCharacterStat: vi.fn(),
    createItemDefinition: vi.fn(),
    updateItemDefinition: vi.fn(),
    createCharacterItem: vi.fn(),
    deleteCharacterItem: vi.fn(),
    moveItemInstance: vi.fn(),
  },
}));

describe('story context persistence', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps location and character mutations in the parent-owned story state', async () => {
    const harness = createHarness();
    vi.mocked(api.createLocation).mockResolvedValue({
      location: { id: 'workshop', name: 'New location', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.updateLocation).mockResolvedValue({
      location: { id: 'harbor', name: 'Server harbor', description: '' },
      ...metadata(3),
    });
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'luc', name: 'New character', description: '', isPlayable: false },
      ...metadata(4),
    });
    vi.mocked(api.updateCharacter).mockResolvedValue({
      character: { id: 'ira', name: 'Ira', description: '', isPlayable: true },
      ...metadata(5),
    });

    await expect(harness.actions.createLocation()).resolves.toBe('workshop');
    await harness.actions.updateLocation('harbor', { name: 'Old harbor' });
    await expect(harness.actions.createCharacter()).resolves.toBe('luc');
    await harness.actions.updateCharacter('ira', { isPlayable: true });

    expect(api.createLocation).toHaveBeenCalledWith('story-1', {
      name: 'New location',
      description: '',
    });
    expect(harness.story().locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'harbor', name: 'Old harbor' }),
        expect.objectContaining({ id: 'workshop' }),
      ]),
    );
    expect(harness.story().characters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mira', isPlayable: false }),
        expect.objectContaining({ id: 'ira', isPlayable: true }),
        expect.objectContaining({ id: 'luc' }),
      ]),
    );
    expect(harness.story()).toMatchObject(metadata(5));
  });

  it('reuses typed stat defaults and compact mutation adapters', async () => {
    const harness = createHarness();
    vi.mocked(api.createStatDefinition).mockResolvedValue({
      statDefinition: { id: 'mood-definition', name: 'Mood', valueType: 'string' },
      ...metadata(2),
    });
    vi.mocked(api.updateStatDefinition).mockResolvedValue({
      statDefinition: { id: 'trust-definition', name: 'Confidence', valueType: 'number' },
      ...metadata(3),
    });
    vi.mocked(api.createCharacterStat).mockResolvedValue({
      characterId: 'mira',
      stat: { id: 'awake', statDefinitionId: 'awake-definition', initialValue: false },
      ...metadata(4),
    });
    vi.mocked(api.updateCharacterStat).mockResolvedValue({
      characterId: 'mira',
      stat: { id: 'trust', statDefinitionId: 'trust-definition', initialValue: 8 },
      ...metadata(5),
    });
    vi.mocked(api.deleteCharacterStat).mockResolvedValue({
      ...storyFixture(),
      revision: 6,
      updatedAt: metadata(6).updatedAt,
      characters: storyFixture().characters?.map((character) => ({
        ...character,
        stats: [],
      })),
    });

    await expect(
      harness.actions.createStatDefinition({ name: 'Mood', valueType: 'string' }),
    ).resolves.toBe('mood-definition');
    await harness.actions.updateStatDefinition('trust-definition', { name: 'Confidence' });
    await harness.actions.createCharacterStat('mira', 'awake-definition');
    await harness.actions.updateCharacterStat('mira', 'trust', { initialValue: 8 });

    expect(api.createCharacterStat).toHaveBeenCalledWith('story-1', 'mira', {
      statDefinitionId: 'awake-definition',
      initialValue: false,
    });
    expect(harness.story().statDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'trust-definition', name: 'Confidence' }),
        expect.objectContaining({ id: 'mood-definition' }),
      ]),
    );
    expect(harness.story().characters?.[0].stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'trust', initialValue: 8 }),
        expect.objectContaining({ id: 'awake', initialValue: false }),
      ]),
    );

    await harness.actions.deleteCharacterStat('mira', 'trust');
    expect(harness.story().characters?.[0].stats).toEqual([]);
  });

  it('uses number, boolean, and string defaults for character stats', async () => {
    const harness = createHarness();
    vi.mocked(api.createCharacterStat).mockImplementation(async (_storyId, characterId, input) => ({
      characterId,
      stat: {
        id: `created-${input.statDefinitionId}`,
        statDefinitionId: input.statDefinitionId,
        initialValue: input.initialValue,
      },
      ...metadata(2),
    }));

    await harness.actions.createCharacterStat('mira', 'trust-definition');
    await harness.actions.createCharacterStat('mira', 'awake-definition');
    await harness.actions.createCharacterStat('mira', 'mood-definition');
    await harness.actions.createCharacterStat('mira', 'missing-definition');

    expect(api.createCharacterStat).toHaveBeenNthCalledWith(1, 'story-1', 'mira', {
      statDefinitionId: 'trust-definition',
      initialValue: 0,
    });
    expect(api.createCharacterStat).toHaveBeenNthCalledWith(2, 'story-1', 'mira', {
      statDefinitionId: 'awake-definition',
      initialValue: false,
    });
    expect(api.createCharacterStat).toHaveBeenNthCalledWith(3, 'story-1', 'mira', {
      statDefinitionId: 'mood-definition',
      initialValue: '',
    });
    expect(api.createCharacterStat).toHaveBeenNthCalledWith(4, 'story-1', 'mira', {
      statDefinitionId: 'missing-definition',
      initialValue: 0,
    });
  });

  it('keeps item definition and instance workflows on the shared story state', async () => {
    const harness = createHarness();
    vi.mocked(api.createItemDefinition).mockResolvedValue({
      itemDefinition: { id: 'bag-definition', name: 'New item', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.updateItemDefinition).mockResolvedValue({
      itemDefinition: { id: 'key-definition', name: 'Old key', description: '' },
      ...metadata(3),
    });
    vi.mocked(api.createCharacterItem).mockResolvedValue({
      characterId: 'mira',
      item: { id: 'key', itemDefinitionId: 'key-definition' },
      ...metadata(4),
    });
    vi.mocked(api.deleteCharacterItem).mockResolvedValue({
      ...storyFixture(),
      revision: 5,
      updatedAt: metadata(5).updatedAt,
    });
    vi.mocked(api.moveItemInstance).mockResolvedValue({
      ...storyFixture(),
      revision: 6,
      updatedAt: metadata(6).updatedAt,
      locations: [
        {
          id: 'harbor',
          name: 'Harbor',
          description: '',
          items: [{ id: 'key', itemDefinitionId: 'key-definition' }],
        },
      ],
    });

    await expect(harness.actions.createItemDefinition()).resolves.toBe('bag-definition');
    await harness.actions.updateItemDefinition('key-definition', { name: 'Old key' });
    await harness.actions.createCharacterItem('mira', 'key-definition');

    expect(harness.story().itemDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'key-definition', name: 'Old key' }),
        expect.objectContaining({ id: 'bag-definition' }),
      ]),
    );
    expect(harness.story().characters?.[0].items).toEqual([
      { id: 'key', itemDefinitionId: 'key-definition' },
    ]);

    await harness.actions.deleteCharacterItem('mira', 'key');
    expect(harness.story().characters?.[0].items).toEqual([]);

    await harness.actions.moveItemInstance('key', { locationId: 'harbor' });
    expect(api.moveItemInstance).toHaveBeenCalledWith('story-1', 'key', {
      locationId: 'harbor',
    });
    expect(harness.story().locations?.[0].items).toEqual([
      { id: 'key', itemDefinitionId: 'key-definition' },
    ]);
  });

  it('leaves optimistic state intact when tracked writes yield no server result', async () => {
    const harness = createHarness(storyFixture(), async () => undefined);

    await expect(harness.actions.createLocation()).resolves.toBeUndefined();
    await harness.actions.updateLocation('harbor', { name: 'Optimistic harbor' });
    await expect(harness.actions.createCharacter()).resolves.toBeUndefined();
    await harness.actions.updateCharacter('mira', { name: 'Optimistic Mira' });
    await expect(
      harness.actions.createStatDefinition({ name: 'No result', valueType: 'number' }),
    ).resolves.toBeUndefined();
    await harness.actions.updateStatDefinition('trust-definition', { name: 'Optimistic trust' });
    await expect(harness.actions.createItemDefinition()).resolves.toBeUndefined();
    await harness.actions.updateItemDefinition('key-definition', { name: 'Optimistic key' });
    await harness.actions.createCharacterStat('mira', 'trust-definition');
    await harness.actions.updateCharacterStat('mira', 'trust', { initialValue: 9 });
    await harness.actions.deleteCharacterStat('mira', 'trust');
    await harness.actions.createCharacterItem('mira', 'key-definition');
    await harness.actions.deleteCharacterItem('mira', 'key');
    await harness.actions.moveItemInstance('key', { locationId: 'harbor' });

    expect(harness.story().locations?.[0].name).toBe('Optimistic harbor');
    expect(harness.story().characters?.[0]).toMatchObject({
      name: 'Optimistic Mira',
      stats: [expect.objectContaining({ initialValue: 9 })],
    });
    expect(harness.story().statDefinitions?.[0].name).toBe('Optimistic trust');
    expect(harness.story().itemDefinitions?.[0].name).toBe('Optimistic key');
  });

  it('does not recreate parent-owned state after it has been unloaded', async () => {
    const harness = createHarness(null);
    vi.mocked(api.createLocation).mockResolvedValue({
      location: { id: 'workshop', name: 'New location', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'luc', name: 'New character', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.createStatDefinition).mockResolvedValue({
      statDefinition: { id: 'mood-definition', name: 'Mood' },
      ...metadata(2),
    });
    vi.mocked(api.createItemDefinition).mockResolvedValue({
      itemDefinition: { id: 'bag-definition', name: 'New item', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.updateLocation).mockResolvedValue({
      location: { id: 'harbor', name: 'Updated', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.updateCharacter).mockResolvedValue({
      character: { id: 'mira', name: 'Updated', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.createCharacterStat).mockResolvedValue({
      characterId: 'mira',
      stat: { id: 'stat', statDefinitionId: 'trust-definition', initialValue: 0 },
      ...metadata(2),
    });
    vi.mocked(api.updateCharacterStat).mockResolvedValue({
      characterId: 'mira',
      stat: { id: 'stat', statDefinitionId: 'trust-definition', initialValue: 1 },
      ...metadata(2),
    });
    vi.mocked(api.deleteCharacterStat).mockResolvedValue(storyFixture());
    vi.mocked(api.updateStatDefinition).mockResolvedValue({
      statDefinition: { id: 'trust-definition', name: 'Updated' },
      ...metadata(2),
    });
    vi.mocked(api.updateItemDefinition).mockResolvedValue({
      itemDefinition: { id: 'key-definition', name: 'Updated', description: '' },
      ...metadata(2),
    });
    vi.mocked(api.createCharacterItem).mockResolvedValue({
      characterId: 'mira',
      item: { id: 'key', itemDefinitionId: 'key-definition' },
      ...metadata(2),
    });
    vi.mocked(api.deleteCharacterItem).mockResolvedValue(storyFixture());
    vi.mocked(api.moveItemInstance).mockResolvedValue(storyFixture());

    await harness.actions.createLocation();
    await harness.actions.updateLocation('harbor', { name: 'Updated' });
    await harness.actions.createCharacter();
    await harness.actions.updateCharacter('mira', { name: 'Updated' });
    await harness.actions.createCharacterStat('mira', 'trust-definition');
    await harness.actions.updateCharacterStat('mira', 'stat', { initialValue: 1 });
    await harness.actions.deleteCharacterStat('mira', 'stat');
    await harness.actions.createStatDefinition({ name: 'Mood' });
    await harness.actions.updateStatDefinition('trust-definition', { name: 'Updated' });
    await harness.actions.createItemDefinition();
    await harness.actions.updateItemDefinition('key-definition', { name: 'Updated' });
    await harness.actions.createCharacterItem('mira', 'key-definition');
    await harness.actions.deleteCharacterItem('mira', 'key');
    await harness.actions.moveItemInstance('key', { locationId: 'harbor' });

    expect(harness.current()).toBeUndefined();
  });
});

function createHarness(
  initialStory: Story | null = storyFixture(),
  trackSave: TrackStorySave = async (operation) => operation(),
) {
  let story: Story | undefined = initialStory ?? undefined;
  const setStory: StoryStateSetter = (next) => {
    story = typeof next === 'function' ? next(story) : next;
  };
  const { result } = renderHook(() =>
    useStoryContextPersistence({
      storyId: 'story-1',
      story,
      setStory,
      trackSave,
    }),
  );

  return {
    actions: result.current,
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
    updatedAt: `2026-08-26T10:00:0${revision}.000Z`,
  };
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    revision: 1,
    title: 'Story',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    locations: [{ id: 'harbor', name: 'Harbor', description: '', items: [] }],
    characters: [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        isPlayable: true,
        stats: [{ id: 'trust', statDefinitionId: 'trust-definition', initialValue: 2 }],
        items: [],
      },
      { id: 'ira', name: 'Ira', description: '', isPlayable: false, stats: [], items: [] },
    ],
    statDefinitions: [
      { id: 'trust-definition', name: 'Trust', valueType: 'number' },
      { id: 'awake-definition', name: 'Awake', valueType: 'boolean' },
      { id: 'mood-definition', name: 'Mood', valueType: 'string' },
    ],
    itemDefinitions: [{ id: 'key-definition', name: 'Key', description: '' }],
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}
