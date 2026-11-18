import { StoriesRepository } from '../stories.repository';
import { StoryEventsService } from '../story.events';
import { Test, type TestingModule } from '@nestjs/testing';
import { StoryAccessService } from './story-access';

const repository = {
  getAccess: jest.fn<
    ReturnType<StoriesRepository['getAccess']>,
    Parameters<StoriesRepository['getAccess']>
  >(),
  find: jest.fn<ReturnType<StoriesRepository['find']>, Parameters<StoriesRepository['find']>>(),
  updateAccess: jest.fn<
    ReturnType<StoriesRepository['updateAccess']>,
    Parameters<StoriesRepository['updateAccess']>
  >(),
  setCollaborator: jest.fn<
    ReturnType<StoriesRepository['setCollaborator']>,
    Parameters<StoriesRepository['setCollaborator']>
  >(),
  removeCollaborator: jest.fn<
    ReturnType<StoriesRepository['removeCollaborator']>,
    Parameters<StoriesRepository['removeCollaborator']>
  >(),
};
const events = {
  publishChange: jest.fn<
    ReturnType<StoryEventsService['publishChange']>,
    Parameters<StoryEventsService['publishChange']>
  >(),
};
const access = {
  visibility: 'private' as const,
  editPolicy: 'owner' as const,
  commentPolicy: 'editors' as const,
  owner: { id: 'user-1', email: 'owner@example.com', displayName: 'Owner' },
  collaborators: [],
};
let moduleRef: TestingModule;
let service: StoryAccessService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [
      StoryAccessService,
      { provide: StoriesRepository, useValue: repository },
      { provide: StoryEventsService, useValue: events },
    ],
  }).compile();
  service = moduleRef.get(StoryAccessService);
});

afterAll(async () => {
  await moduleRef.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  repository.getAccess.mockResolvedValue(access);
  repository.find.mockResolvedValue(undefined);
});

it('does not expose access configuration to an unauthorized actor', async () => {
  repository.getAccess.mockResolvedValueOnce(undefined);

  await expect(service.get('story-1', 'user-2')).rejects.toThrow('Story not found');
});

it('distinguishes a readable Story from one hidden by access policy', async () => {
  repository.getAccess.mockResolvedValueOnce(undefined);
  repository.find.mockResolvedValueOnce({
    id: 'story-1',
    title: 'Readable story',
    interactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  await expect(service.get('story-1', 'reader-1')).rejects.toThrow(
    'Story access management required',
  );
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
