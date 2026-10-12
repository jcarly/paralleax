import { BadRequestException } from '@nestjs/common';
import type { Story } from '@paralleax/shared';
import type { StoryMutationService } from './story-mutations';
import { StoryGroupService } from './story-groups';

describe('StoryGroupService', () => {
  const mutations = { update: jest.fn() };
  const service = new StoryGroupService(mutations as unknown as StoryMutationService);

  beforeEach(() => {
    jest.clearAllMocks();
    mutations.update.mockImplementation(
      async (_storyId: string, mutation: (story: Story) => Story, _userId: string) => {
        const story = mutation(storyFixture());
        story.revision = 4;
        story.updatedAt = '2026-10-06T10:00:00.000Z';
        return story;
      },
    );
  });

  it('creates a neutral group with explicitly selected interactions', async () => {
    const result = await service.create(
      'story-1',
      { title: '  Opening arc  ', interactionIds: ['interaction-1', 'interaction-2'] },
      'user-1',
    );

    expect(result).toMatchObject({
      revision: 4,
      updatedAt: '2026-10-06T10:00:00.000Z',
      group: {
        title: 'Opening arc',
        interactionIds: ['interaction-1', 'interaction-2'],
      },
    });
    expect(mutations.update).toHaveBeenCalledWith(
      'story-1',
      expect.any(Function),
      'user-1',
      'group.created',
    );
  });

  it('rejects selections that reference an interaction from another Story', async () => {
    await expect(
      service.create('story-1', { title: 'Invalid', interactionIds: ['foreign-interaction'] }, 'user-1'),
    ).rejects.toThrow('Group members must belong to the same Story');
  });

  it('rejects duplicate Interaction membership', async () => {
    await expect(
      service.create(
        'story-1',
        { title: 'Duplicate', interactionIds: ['interaction-1', 'interaction-1'] },
        'user-1',
      ),
    ).rejects.toThrow('Group Interaction members must be unique');
  });

  it('rejects a blank group title after trimming whitespace', async () => {
    await expect(
      service.create('story-1', { title: '   ', interactionIds: ['interaction-1'] }, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    interactions: [
      {
        id: 'interaction-1',
        title: 'One',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [],
      },
      {
        id: 'interaction-2',
        title: 'Two',
        body: '',
        position: { x: 0, y: 100 },
        triggers: [],
      },
    ],
    createdAt: '2026-10-06T09:00:00.000Z',
    updatedAt: '2026-10-06T09:00:00.000Z',
  };
}
