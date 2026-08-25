import type { Story } from '@paralleax/shared';
import type { StoriesRepository } from '../stories.repository';
import type { StoryEventsService } from '../story.events';
import { StoryMetadataService } from './story-metadata';
import type { StoryMutationService } from './story-mutations';

describe('StoryMetadataService', () => {
  const repository = {
    list: jest.fn(),
    listPublic: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const events = { stream: jest.fn(), publishChange: jest.fn() };
  const mutations = { update: jest.fn() };
  const service = new StoryMetadataService(
    repository as unknown as StoriesRepository,
    events as unknown as StoryEventsService,
    mutations as unknown as StoryMutationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.find.mockResolvedValue(storyFixture());
    repository.save.mockResolvedValue(undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('delegates story lists and normalizes legacy positions on reads', async () => {
    repository.list.mockResolvedValue([{ id: 'story-1' }]);
    repository.listPublic.mockResolvedValue([{ id: 'public-story' }]);

    await expect(service.list('user-1')).resolves.toEqual([{ id: 'story-1' }]);
    await expect(service.listPublic()).resolves.toEqual([{ id: 'public-story' }]);
    await expect(service.get('story-1', 'user-1')).resolves.toMatchObject({
      interactions: [{ id: 'root', position: { x: 80, y: 120 } }],
    });
  });

  it('only exposes the authoring event stream to editors', async () => {
    const stream = { kind: 'story-stream' };
    events.stream.mockReturnValue(stream);

    await expect(service.stream('story-1', 'user-1')).resolves.toBe(stream);

    const readable = storyFixture();
    readable.capabilities = { canRead: true, canEdit: false, canManage: false, canComment: true };
    repository.find.mockResolvedValueOnce(readable);
    await expect(service.stream('story-1', 'reader-1')).rejects.toThrow(
      'Story edit access required',
    );
  });

  it('creates a trimmed story with current defaults', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T16:30:00.000Z'));

    const story = await service.create({ title: '  New story  ' }, 'user-1');

    expect(story).toMatchObject({
      revision: 1,
      title: 'New story',
      startDateTime: '2026-08-25T16:30',
      access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
      createdAt: '2026-08-25T16:30:00.000Z',
      updatedAt: '2026-08-25T16:30:00.000Z',
    });
    expect(repository.save).toHaveBeenCalledWith(story, 'user-1');
  });

  it('restricts deterministic demo creation to administrators', async () => {
    await expect(service.createDemo('user-1', 'user')).rejects.toThrow(
      'Administrator access required',
    );

    const story = await service.createDemo('admin-1', 'admin');
    expect(story.title).toBe('Demo: branching investigation');
    expect(repository.save).toHaveBeenCalledWith(story, 'admin-1');
  });

  it('updates title and story-local start time through the shared mutation coordinator', async () => {
    mutations.update.mockImplementation(
      async (_storyId: string, mutation: (story: Story) => Story) => mutation(storyFixture()),
    );

    await expect(
      service.update(
        'story-1',
        { title: '  Renamed  ', startDateTime: '2026-08-26T09:45' },
        'user-1',
      ),
    ).resolves.toMatchObject({ title: 'Renamed', startDateTime: '2026-08-26T09:45' });
    await expect(
      service.update('story-1', { startDateTime: '2026-02-30T09:45' }, 'user-1'),
    ).rejects.toThrow('Story start date and time is invalid');
  });

  it('publishes deletion only after an authorized repository delete', async () => {
    repository.delete.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(service.delete('story-1', 'reader-1')).rejects.toThrow('Story not found');
    expect(events.publishChange).not.toHaveBeenCalled();

    await service.delete('story-1', 'user-1');
    expect(events.publishChange).toHaveBeenCalledWith('story-1', 'deleted');
  });
});

function storyFixture(): Story {
  const story: Story = {
    id: 'story-1',
    revision: 2,
    title: 'Story',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: 'Start',
        position: { x: 10, y: 20 },
        triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
  delete (story.interactions[0] as Partial<Story['interactions'][number]>).position;
  return story;
}
