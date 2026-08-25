import type { Story } from '@paralleax/shared';
import type { StoriesRepository } from '../stories.repository';
import { StoryReaderProgressService } from './story-reader-progress';

describe('StoryReaderProgressService', () => {
  const repository = {
    find: jest.fn(),
    findProgress: jest.fn(),
    saveProgress: jest.fn(),
    deleteProgress: jest.fn(),
  };
  const service = new StoryReaderProgressService(repository as unknown as StoriesRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue(storyFixture());
    repository.saveProgress.mockResolvedValue(true);
  });

  afterEach(() => jest.useRealTimers());

  it('loads an optional progress snapshot only after resolving story access', async () => {
    repository.findProgress.mockResolvedValue(undefined);

    await expect(service.get('story-1', 'user-1')).resolves.toBeNull();

    expect(repository.find).toHaveBeenCalledWith('story-1', 'user-1');
    expect(repository.findProgress).toHaveBeenCalledWith('story-1', 'user-1');
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
        version: 2,
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
    );
  });

  it('does not expose inaccessible stories and checks access before deletion', async () => {
    repository.find.mockResolvedValueOnce(undefined);
    await expect(service.get('missing-story', 'user-1')).rejects.toThrow('Story not found');

    await service.delete('story-1', 'user-1');
    expect(repository.deleteProgress).toHaveBeenCalledWith('story-1', 'user-1');
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    startDateTime: '2026-08-25T08:00',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
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
