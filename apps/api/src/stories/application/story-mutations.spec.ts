import type { Story } from '@paralleax/shared';
import type { StoriesRepository } from '../stories.repository';
import type { StoryEventsService } from '../story.events';
import { StoryMutationService } from './story-mutations';

describe('StoryMutationService', () => {
  const repository = { mutate: jest.fn() };
  const events = { publishChange: jest.fn() };
  const service = new StoryMutationService(
    repository as unknown as StoriesRepository,
    events as unknown as StoryEventsService,
  );

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('normalizes and versions one authorized mutation before publishing it', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-25T15:00:00.000Z'));
    repository.mutate.mockImplementation(
      async (_storyId: string, mutation: (story: Story) => Story) => mutation(storyFixture()),
    );

    const updated = await service.update(
      'story-1',
      (story) => ({ ...story, id: 'foreign-id', title: 'Updated' }),
      'user-1',
    );

    expect(updated).toMatchObject({
      id: 'story-1',
      revision: 3,
      title: 'Updated',
      updatedAt: '2026-08-25T15:00:00.000Z',
      interactions: [{ id: 'root', position: { x: 80, y: 120 } }],
    });
    expect(repository.mutate).toHaveBeenCalledWith('story-1', expect.any(Function), 'user-1');
    expect(events.publishChange).toHaveBeenCalledWith('story-1', 'updated', 3);
  });

  it('does not publish when the story cannot be mutated', async () => {
    repository.mutate.mockResolvedValue(undefined);

    await expect(service.update('missing-story', (story) => story, 'user-1')).rejects.toThrow(
      'Story not found',
    );
    expect(events.publishChange).not.toHaveBeenCalled();
  });
});

function storyFixture(): Story {
  const story: Story = {
    id: 'story-1',
    revision: 2,
    title: 'Story',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
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
