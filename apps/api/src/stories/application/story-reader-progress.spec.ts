import type { Story } from '@paralleax/shared';
import type { StoriesRepository } from '../stories.repository';
import { StoryReaderProgressService } from './story-reader-progress';

describe('StoryReaderProgressService', () => {
  const repository = {
    find: jest.fn(),
    findProgress: jest.fn(),
    findProgressSaves: jest.fn(),
    saveProgress: jest.fn(),
    deleteProgress: jest.fn(),
  };
  const service = new StoryReaderProgressService(repository as unknown as StoriesRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue(storyFixture());
    repository.saveProgress.mockResolvedValue(true);
    repository.findProgressSaves.mockResolvedValue([]);
  });

  afterEach(() => jest.useRealTimers());

  it('loads an optional progress snapshot only after resolving story access', async () => {
    repository.findProgress.mockResolvedValue(undefined);

    await expect(service.get('story-1', 'user-1')).resolves.toBeNull();

    expect(repository.find).toHaveBeenCalledWith('story-1', 'user-1');
    expect(repository.findProgress).toHaveBeenCalledWith('story-1', 'user-1', 'reader-autosave');
  });

  it('validates same-story journey and item references before saving derived state', async () => {
    await expect(
      service.save('story-1', { journeyInteractionIds: ['other-interaction'] }, 'user-1'),
    ).rejects.toThrow('Reader journey interactions must belong to the same story');
    await expect(
      service.save(
        'story-1',
        { journeyInteractionIds: ['root'], ownedItemIds: ['other-item'] },
        'user-1',
      ),
    ).rejects.toThrow('Reader items must belong to the same story');
    expect(repository.saveProgress).not.toHaveBeenCalled();
  });

  it('rebuilds and persists reader state from the ordered journey', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00.000Z'));

    const progress = await service.save(
      'story-1',
      { journeyInteractionIds: ['root'], ownedItemIds: ['item-1'] },
      'user-1',
    );

    expect(progress).toMatchObject({
      state: {
        version: 4,
        randomSeed: expect.any(String),
        stepStartedAt: ['2026-08-25T12:00:00.000Z', '2026-08-25T12:00:00.000Z'],
        journeyInteractionIds: ['root'],
        currentInteractionId: 'root',
      },
      updatedAt: '2026-08-25T12:00:00.000Z',
    });
    expect(repository.saveProgress).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      progress.state,
      progress.updatedAt,
      'reader-autosave',
      undefined,
      progress.updatedAt,
    );
  });

  it('preserves one supplied wall-clock start per reader step', async () => {
    const stepStartedAt = ['2026-08-25T11:59:00.000Z', '2026-08-25T12:00:00.000Z'];

    const progress = await service.save(
      'story-1',
      { journeyInteractionIds: ['root'], stepStartedAt },
      'user-1',
    );

    expect(progress.state.stepStartedAt).toEqual(stepStartedAt);
    await expect(
      service.save(
        'story-1',
        { journeyInteractionIds: ['root'], stepStartedAt: [stepStartedAt[0]] },
        'user-1',
      ),
    ).rejects.toThrow('Reader timer steps must contain one timestamp');
  });

  it('preserves an existing run seed for legacy clients that do not send it', async () => {
    repository.findProgress.mockResolvedValueOnce({
      state: {
        version: 3,
        randomSeed: 'existing-seed',
        journeyInteractionIds: [],
        currentInteractionId: null,
        visitedInteractionIds: [],
        currentDateTime: '2000-01-03T08:00',
        currentLocationId: null,
        statValues: {},
        ownedItemIds: [],
      },
      updatedAt: '2026-08-25T11:00:00.000Z',
    });

    const progress = await service.save('story-1', { journeyInteractionIds: ['root'] }, 'user-1');

    expect(progress.state.randomSeed).toBe('existing-seed');
  });

  it('keeps reader and simulation autosaves in distinct reserved slots', async () => {
    await service.save('story-1', { journeyInteractionIds: ['root'] }, 'user-1', 'simulation');
    await service.delete('story-1', 'user-1', 'simulation');

    expect(repository.saveProgress).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      expect.objectContaining({ currentInteractionId: 'root' }),
      expect.any(String),
      'simulation-autosave',
      undefined,
      expect.any(String),
    );
    expect(repository.deleteProgress).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      'simulation-autosave',
    );
  });

  it('requires effective edit access for the simulation autosave', async () => {
    repository.find.mockResolvedValueOnce({
      ...storyFixture(),
      capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
    });

    await expect(service.get('story-1', 'user-1', 'simulation')).rejects.toThrow('Story not found');
    expect(repository.findProgress).not.toHaveBeenCalled();
  });

  it('creates named manual saves and returns them as list summaries', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-27T12:00:00.000Z'));

    const save = await service.createSave(
      'story-1',
      { name: '  Before the gate  ', journeyInteractionIds: ['root'] },
      'user-1',
    );
    repository.findProgressSaves.mockResolvedValueOnce([save]);

    await expect(service.listSaves('story-1', 'user-1')).resolves.toEqual([
      expect.objectContaining({
        id: save.id,
        kind: 'manual',
        name: 'Before the gate',
        currentInteractionId: 'root',
        journeyLength: 1,
      }),
    ]);
    expect(repository.saveProgress).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      expect.any(Object),
      '2026-08-27T12:00:00.000Z',
      expect.any(String),
      'Before the gate',
      '2026-08-27T12:00:00.000Z',
    );
  });

  it('limits manual saves without counting the two autosaves', async () => {
    repository.findProgressSaves.mockResolvedValueOnce([
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `manual-${index}`,
        kind: 'manual' as const,
      })),
      { id: 'reader-autosave', kind: 'reader-autosave' as const },
      { id: 'simulation-autosave', kind: 'simulation-autosave' as const },
    ]);

    await expect(
      service.createSave(
        'story-1',
        { name: 'One save too many', journeyInteractionIds: ['root'] },
        'user-1',
      ),
    ).rejects.toThrow('A story can have at most 20 manual saves per user');
    expect(repository.saveProgress).not.toHaveBeenCalled();
  });

  it('does not expose inaccessible stories and checks access before deletion', async () => {
    repository.find.mockResolvedValueOnce(undefined);
    await expect(service.get('missing-story', 'user-1')).rejects.toThrow('Story not found');

    await service.delete('story-1', 'user-1');
    expect(repository.deleteProgress).toHaveBeenCalledWith('story-1', 'user-1', 'reader-autosave');
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    startDateTime: '2026-08-25T08:00',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    characters: [
      {
        id: 'character-1',
        name: 'Character',
        description: '',
        items: [{ id: 'item-1', itemDefinitionId: 'item-definition-1' }],
      },
    ],
    itemDefinitions: [{ id: 'item-definition-1', name: 'Item', description: '' }],
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: 'Start',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}
