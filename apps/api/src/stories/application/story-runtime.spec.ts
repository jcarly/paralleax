import type { StoriesRepository } from '../stories.repository';
import { StoryRuntimeService } from './story-runtime';

describe('StoryRuntimeService', () => {
  const repository = {
    findRuntimeBootstrap: jest.fn(),
    findRuntimeContextPage: jest.fn(),
    findRuntimeSlice: jest.fn(),
  };
  const service = new StoryRuntimeService(repository as unknown as StoriesRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findRuntimeBootstrap.mockResolvedValue({
      id: 'story-1',
      revision: 3,
      title: 'Story',
      contextCounts: {
        locations: 1,
        characters: 0,
        statDefinitions: 0,
        statAssignments: 0,
        itemDefinitions: 0,
        itemInstances: 0,
        graphDecorations: 0,
      },
      interactionCount: 2,
      triggerCount: 2,
    });
    repository.findRuntimeContextPage.mockResolvedValue({
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
      graphDecorations: [],
    });
    repository.findRuntimeSlice.mockResolvedValue({
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
    });
  });

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
      revision: 4,
      page: 1,
      pageSize: 100,
      hasMore: false,
      locations: [],
      characters: [],
      statDefinitions: [],
      statAssignments: [],
      itemDefinitions: [],
      itemInstances: [],
      graphDecorations: [],
    });

    await expect(service.getStoryForJourney('story-1', 'user-1', [])).rejects.toThrow(
      'changed while its runtime state was loading',
    );
  });
});
