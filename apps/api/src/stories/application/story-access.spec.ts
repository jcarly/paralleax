import type { StoriesRepository } from '../stories.repository';
import type { StoryEventsService } from '../story.events';
import { StoryAccessService } from './story-access';

describe('StoryAccessService', () => {
  const repository = {
    getAccess: jest.fn(),
    updateAccess: jest.fn(),
    setCollaborator: jest.fn(),
    removeCollaborator: jest.fn(),
  };
  const events = { publishChange: jest.fn() };
  const service = new StoryAccessService(
    repository as unknown as StoriesRepository,
    events as unknown as StoryEventsService,
  );
  const access = {
    visibility: 'private' as const,
    editPolicy: 'owner' as const,
    commentPolicy: 'editors' as const,
    owner: { id: 'user-1', email: 'owner@example.com' },
    collaborators: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.getAccess.mockResolvedValue(access);
  });

  it('does not expose access configuration to an unauthorized actor', async () => {
    repository.getAccess.mockResolvedValueOnce(undefined);

    await expect(service.get('story-1', 'user-2')).rejects.toThrow('Story not found');
  });

  it('updates access settings and publishes one invalidation', async () => {
    repository.updateAccess.mockResolvedValue(true);

    await expect(
      service.update(
        'story-1',
        { visibility: 'public', editPolicy: 'owner', commentPolicy: 'readers' },
        'user-1',
      ),
    ).resolves.toBe(access);

    expect(repository.updateAccess).toHaveBeenCalledWith('story-1', 'user-1', {
      visibility: 'public',
      editPolicy: 'owner',
      commentPolicy: 'readers',
    });
    expect(events.publishChange).toHaveBeenCalledWith('story-1', 'access-updated');
  });

  it('normalizes collaborator email and rejects an invalid account', async () => {
    repository.setCollaborator.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.setCollaborator(
      'story-1',
      { email: '  REVIEWER@Example.COM ', role: 'editor' },
      'user-1',
    );
    expect(repository.setCollaborator).toHaveBeenCalledWith(
      'story-1',
      'user-1',
      'reviewer@example.com',
      'editor',
    );
    expect(events.publishChange).toHaveBeenCalledTimes(1);

    await expect(
      service.setCollaborator('story-1', { email: 'owner@example.com', role: 'viewer' }, 'user-1'),
    ).rejects.toThrow('The collaborator must be an existing non-owner account');
    expect(events.publishChange).toHaveBeenCalledTimes(1);
  });

  it('publishes a removal only when a collaborator was actually removed', async () => {
    repository.removeCollaborator.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await service.removeCollaborator('story-1', 'user-2', 'user-1');
    expect(events.publishChange).not.toHaveBeenCalled();

    await service.removeCollaborator('story-1', 'user-2', 'user-1');
    expect(events.publishChange).toHaveBeenCalledWith('story-1', 'access-updated');
  });
});
