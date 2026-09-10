import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryEditorBootstrap } from '@paralleax/shared';
import { api } from '../../../api';
import { loadStoryEditorProjection } from './storyEditorLoader';

vi.mock('../../../api', () => ({
  api: {
    getStoryEditorBootstrap: vi.fn(),
    getStoryEditorContextPage: vi.fn(),
    getStoryEditorInteractionPage: vi.fn(),
    getStoryEditorTriggerPage: vi.fn(),
    getStoryEditorInteractionContentPage: vi.fn(),
    getStoryEditorTriggerContentPage: vi.fn(),
  },
}));

describe('story editor loader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getStoryEditorBootstrap).mockResolvedValue(bootstrap());
    vi.mocked(api.getStoryEditorContextPage).mockResolvedValue({
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      locations: [{ id: 'place', name: 'Place', description: '' }],
      characters: [],
      statDefinitions: [],
      statAssignments: [],
      itemDefinitions: [],
      itemInstances: [],
      graphDecorations: [],
    });
    vi.mocked(api.getStoryEditorInteractionPage).mockResolvedValue({
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      interactions: [
        {
          id: 'interaction',
          title: 'Interaction',
          position: { x: 10, y: 20 },
          locationId: 'place',
        },
      ],
    });
    vi.mocked(api.getStoryEditorTriggerPage).mockResolvedValue({
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      triggers: [
        {
          id: 'trigger',
          outputInteractionId: 'interaction',
          inputInteractionIds: [],
        },
      ],
    });
    vi.mocked(api.getStoryEditorInteractionContentPage).mockResolvedValue({
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      interactions: [{ interactionId: 'interaction', body: 'Loaded body' }],
    });
    vi.mocked(api.getStoryEditorTriggerContentPage).mockResolvedValue({
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      triggers: [
        {
          triggerId: 'trigger',
          conditionGroups: [],
          appearanceProbability: 75,
          timerSeconds: 4,
        },
      ],
    });
  });

  it('loads context, graph structure, then content into one Story projection', async () => {
    const phases: string[] = [];

    const story = await loadStoryEditorProjection('story-1', ({ phase }) => phases.push(phase));

    expect(story.locations).toEqual([
      { id: 'place', name: 'Place', description: '', stats: [], items: [] },
    ]);
    expect(story.interactions[0]).toMatchObject({
      id: 'interaction',
      body: 'Loaded body',
      triggers: [
        {
          id: 'trigger',
          appearanceProbability: 75,
          timerSeconds: 4,
        },
      ],
    });
    expect(phases[0]).toBe('context');
    expect(phases.indexOf('interactions')).toBeLessThan(phases.indexOf('triggers'));
    expect(phases.indexOf('triggers')).toBeLessThan(phases.indexOf('content'));
    expect(phases.at(-1)).toBe('ready');
  });

  it('restarts the staged load when pages no longer share one revision', async () => {
    vi.mocked(api.getStoryEditorContextPage)
      .mockResolvedValueOnce({
        revision: 8,
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
      })
      .mockResolvedValueOnce({
        revision: 7,
        page: 1,
        pageSize: 100,
        hasMore: false,
        locations: [{ id: 'place', name: 'Place', description: '' }],
        characters: [],
        statDefinitions: [],
        statAssignments: [],
        itemDefinitions: [],
        itemInstances: [],
        graphDecorations: [],
      });

    const story = await loadStoryEditorProjection('story-1');

    expect(api.getStoryEditorBootstrap).toHaveBeenCalledTimes(2);
    expect(story.revision).toBe(7);
  });

  it('stops with a recoverable error when revision churn exhausts the bounded retries', async () => {
    vi.mocked(api.getStoryEditorContextPage).mockResolvedValue({
      revision: 8,
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

    await expect(loadStoryEditorProjection('story-1')).rejects.toThrow(
      'The Story changed while it was loading.',
    );
    expect(api.getStoryEditorBootstrap).toHaveBeenCalledTimes(3);
  });

  it('rejects a prematurely truncated page instead of exposing a partial Story', async () => {
    vi.mocked(api.getStoryEditorBootstrap).mockResolvedValue({
      ...bootstrap(),
      interactionCount: 2,
    });

    await expect(loadStoryEditorProjection('story-1')).rejects.toThrow(
      'interaction structure returned 1 of 2 expected records',
    );
  });

  it('rejects Trigger structure that references an interaction outside the projection', async () => {
    vi.mocked(api.getStoryEditorTriggerPage).mockResolvedValue({
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      triggers: [
        {
          id: 'trigger',
          outputInteractionId: 'missing-interaction',
          inputInteractionIds: [],
        },
      ],
    });

    await expect(loadStoryEditorProjection('story-1')).rejects.toThrow(
      'Trigger structure references an interaction outside the projection',
    );
  });
});

function bootstrap(): StoryEditorBootstrap {
  return {
    id: 'story-1',
    revision: 7,
    title: 'Editor fixture',
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    contextCounts: {
      locations: 1,
      characters: 0,
      statDefinitions: 0,
      statAssignments: 0,
      itemDefinitions: 0,
      itemInstances: 0,
      graphDecorations: 0,
    },
    interactionCount: 1,
    triggerCount: 1,
  };
}
