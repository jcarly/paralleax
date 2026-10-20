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
      service.create(
        'story-1',
        { title: 'Invalid', interactionIds: ['foreign-interaction'] },
        'user-1',
      ),
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

  it('renames groups, changes membership, nests and promotes children on deletion', async () => {
    let current = storyFixture();
    current.groups = [
      { id: 'parent', title: 'Parent', interactionIds: ['interaction-1'] },
      { id: 'child', title: 'Child', interactionIds: [] },
    ];
    mutations.update.mockImplementation(async (_id: string, mutation: (story: Story) => Story) => {
      current = mutation(structuredClone(current));
      return current;
    });
    await service.update(
      'story-1',
      'child',
      { title: ' Renamed ', parentGroupId: 'parent', interactionIds: ['interaction-2'] },
      'user-1',
    );
    expect(current.groups![1]).toEqual({
      id: 'child',
      title: 'Renamed',
      parentGroupId: 'parent',
      interactionIds: ['interaction-2'],
    });
    await expect(
      service.update('story-1', 'parent', { parentGroupId: 'child' }, 'user-1'),
    ).rejects.toThrow('cycles');
    await expect(
      service.update('story-1', 'child', { parentGroupId: 'foreign' }, 'user-1'),
    ).rejects.toThrow('same Story');
    await expect(
      service.update('story-1', 'child', { interactionIds: ['missing'] }, 'user-1'),
    ).rejects.toThrow('same Story');
    await expect(
      service.update('story-1', 'missing', { title: 'Unknown' }, 'user-1'),
    ).rejects.toThrow('Group not found');
    const deleted = await service.delete('story-1', 'parent', 'user-1');
    expect(deleted.groupId).toBe('parent');
    expect(current.groups).toEqual([
      { id: 'child', title: 'Renamed', interactionIds: ['interaction-2'] },
    ]);
    expect(current.interactions).toHaveLength(2);
  });

  it('transfers selected Interactions on creation and update, leaving mixed parent contents intact', async () => {
    let current = storyFixture();
    current.groups = [
      { id: 'parent', title: 'Parent', interactionIds: ['interaction-1'] },
      { id: 'child', title: 'Child', parentGroupId: 'parent', interactionIds: ['interaction-2'] },
    ];
    mutations.update.mockImplementation(async (_id: string, mutation: (story: Story) => Story) => {
      current = mutation(structuredClone(current));
      return current;
    });
    const created = await service.create(
      'story-1',
      { title: 'New', interactionIds: ['interaction-1'] },
      'user-1',
    );
    expect(current.groups![0].interactionIds).toEqual([]);
    expect(current.groups![1].interactionIds).toEqual(['interaction-2']);
    await service.update('story-1', 'parent', { interactionIds: ['interaction-1'] }, 'user-1');
    expect(current.groups!.find(({ id }) => id === created.group.id)!.interactionIds).toEqual([]);
    expect(current.groups![0].interactionIds).toEqual(['interaction-1']);
    expect(current.groups![1].parentGroupId).toBe('parent');
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
