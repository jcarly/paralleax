import { Test, type TestingModule } from '@nestjs/testing';
import type {
  StoryRuntimeBootstrap,
  StoryRuntimeContextPage,
  StoryRuntimeSlice,
} from '@paralleax/shared';
import { StoriesRepository } from '../stories.repository';
import { StoryRuntimeService } from './story-runtime';

const repository = {
  findRuntimeBootstrap: jest.fn(),
  findRuntimeContextPage: jest.fn(),
  findRuntimeSlice: jest.fn(),
};
let moduleRef: TestingModule;
let service: StoryRuntimeService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [StoryRuntimeService, { provide: StoriesRepository, useValue: repository }],
  }).compile();
  service = moduleRef.get(StoryRuntimeService);
});

afterAll(async () => {
  await moduleRef.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  repository.findRuntimeBootstrap.mockResolvedValue(runtimeBootstrapFixture());
  repository.findRuntimeContextPage.mockResolvedValue(runtimeContextPageFixture());
  repository.findRuntimeSlice.mockResolvedValue(runtimeSliceFixture());
});

function runtimeBootstrapFixture(): StoryRuntimeBootstrap {
  return {
    id: 'story-1',
    revision: 3,
    title: 'Story',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
    contextCounts: {
      locations: 1,
      characters: 0,
      statDefinitions: 0,
      statAssignments: 0,
      itemDefinitions: 0,
      itemInstances: 0,
      groups: 0,
      graphDecorations: 0,
    },
    interactionCount: 2,
    triggerCount: 2,
  };
}

function runtimeContextPageFixture(): StoryRuntimeContextPage {
  return {
    revision: 3,
    page: 1,
    pageSize: 100,
    hasMore: false,
    locations: [{ id: 'location', name: 'Location', description: '' }],
    characters: [],
    statDefinitions: [],
    statAssignments: [],
    itemDefinitions: [],
    itemInstances: [],
    groups: [],
    graphDecorations: [],
  };
}

function runtimeSliceFixture(): StoryRuntimeSlice {
  return {
    revision: 3,
    page: 1,
    pageSize: 100,
    totalOptionCount: 0,
    hasMore: false,
    optionInteractionIds: [],
    interactionReferences: [],
    interactions: [
      {
        id: 'current',
        title: 'Current',
        body: 'Body',
        position: { x: 0, y: 0 },
        triggers: [],
      },
    ],
  };
}

it('assembles only runtime context and requested journey interactions', async () => {
  const story = await service.getStoryForJourney('story-1', 'user-1', ['current']);

  expect(story.locations).toEqual([
    { id: 'location', name: 'Location', description: '', stats: [], items: [] },
  ]);
  expect(story.interactions.map(({ id }) => id)).toEqual(['current']);
  expect(repository.findRuntimeSlice).toHaveBeenCalledWith(
    'story-1',
    'user-1',
    expect.objectContaining({
      interactionIds: ['current'],
      includeOptions: false,
    }),
  );
});

it('rejects pages from another authored revision', async () => {
  repository.findRuntimeContextPage.mockResolvedValueOnce({
    ...runtimeContextPageFixture(),
    revision: 4,
  });

  await expect(service.getStoryForJourney('story-1', 'user-1', [])).rejects.toThrow(
    'changed while its runtime state was loading',
  );
});
