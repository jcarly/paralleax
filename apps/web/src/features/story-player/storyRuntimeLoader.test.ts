import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interaction, Story, StoryRuntimeSlice } from '@paralleax/shared';
import { api } from '../../api';
import { loadStoryRuntimeSlice } from './storyRuntimeLoader';

vi.mock('../../api', () => ({
  api: {
    getStoryRuntimeSlice: vi.fn(),
  },
}));

describe('story runtime loader', () => {
  beforeEach(() => vi.resetAllMocks());

  it('replaces stale candidates with the options for the current interaction', async () => {
    const story = storyFixture([interaction('current'), interaction('old-option', ['current'])]);
    vi.mocked(api.getStoryRuntimeSlice).mockResolvedValue(
      runtimeSlice({
        totalOptionCount: 1,
        optionInteractionIds: ['new-option'],
        interactions: [interaction('current'), interaction('new-option', ['current'])],
      }),
    );

    const loaded = await loadStoryRuntimeSlice(story, 'current', ['current']);

    expect(loaded.interactions.map(({ id }) => id)).toEqual(['current', 'new-option']);
    expect(loaded.interactions.find(({ id }) => id === 'new-option')?.triggers).toHaveLength(1);
  });

  it('paginates options without resending the journey on every page', async () => {
    vi.mocked(api.getStoryRuntimeSlice)
      .mockResolvedValueOnce(
        runtimeSlice({
          hasMore: true,
          pageSize: 1,
          totalOptionCount: 2,
          optionInteractionIds: ['option-1'],
          interactions: [interaction('current'), interaction('option-1', ['current'])],
        }),
      )
      .mockResolvedValueOnce(
        runtimeSlice({
          page: 2,
          pageSize: 1,
          totalOptionCount: 2,
          optionInteractionIds: ['option-2'],
          interactions: [interaction('option-2', ['current'])],
        }),
      );

    const loaded = await loadStoryRuntimeSlice(storyFixture([interaction('current')]), 'current', [
      'current',
    ]);

    expect(api.getStoryRuntimeSlice).toHaveBeenNthCalledWith(
      1,
      'story-1',
      expect.objectContaining({ interactionIds: [], includeOptions: true, page: 1 }),
    );
    expect(api.getStoryRuntimeSlice).toHaveBeenNthCalledWith(
      2,
      'story-1',
      expect.objectContaining({ interactionIds: [], includeOptions: true, page: 2 }),
    );
    expect(loaded.interactions.map(({ id }) => id)).toEqual(['current', 'option-1', 'option-2']);
  });

  it('loads journeys longer than the request limit in bounded chunks', async () => {
    const journey = Array.from({ length: 205 }, (_, index) => `step-${index}`);
    const story = storyFixture([]);
    vi.mocked(api.getStoryRuntimeSlice).mockImplementation(async (_storyId, request = {}) =>
      runtimeSlice({
        interactions: (request.interactionIds ?? []).map((id) => interaction(id)),
      }),
    );

    const loaded = await loadStoryRuntimeSlice(story, journey.at(-1)!, journey);

    expect(api.getStoryRuntimeSlice).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.getStoryRuntimeSlice).mock.calls[0][1]!).toMatchObject({
      interactionIds: journey.slice(0, 200),
      includeOptions: true,
    });
    expect(vi.mocked(api.getStoryRuntimeSlice).mock.calls[1][1]!).toMatchObject({
      interactionIds: journey.slice(200),
      includeOptions: false,
    });
    expect(loaded.interactions).toHaveLength(205);
  });

  it('does not reload journey interactions that are already hydrated', async () => {
    const story = storyFixture([interaction('previous'), interaction('current', ['previous'])]);
    vi.mocked(api.getStoryRuntimeSlice).mockResolvedValue(runtimeSlice({}));

    const loaded = await loadStoryRuntimeSlice(story, 'current', ['previous', 'current']);

    expect(api.getStoryRuntimeSlice).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ interactionIds: [], includeOptions: true }),
    );
    expect(loaded.interactions.map(({ id }) => id)).toEqual(['previous', 'current']);
  });

  it('hydrates a title-only condition reference when it enters the journey', async () => {
    vi.mocked(api.getStoryRuntimeSlice)
      .mockResolvedValueOnce(
        runtimeSlice({ interactionReferences: [{ id: 'referenced', title: 'Referenced' }] }),
      )
      .mockResolvedValueOnce(runtimeSlice({ interactions: [interaction('referenced')] }));

    const withReference = await loadStoryRuntimeSlice(storyFixture([]), null, []);
    const hydrated = await loadStoryRuntimeSlice(withReference, 'referenced', ['referenced']);

    expect(api.getStoryRuntimeSlice).toHaveBeenNthCalledWith(
      2,
      'story-1',
      expect.objectContaining({ interactionIds: ['referenced'], includeOptions: true }),
    );
    expect(hydrated.interactions[0]).toMatchObject({
      id: 'referenced',
      body: 'referenced body',
    });
  });

  it('rejects a truncated option page instead of treating it as a branch ending', async () => {
    vi.mocked(api.getStoryRuntimeSlice).mockResolvedValue(
      runtimeSlice({
        totalOptionCount: 2,
        optionInteractionIds: ['option-1'],
        interactions: [interaction('option-1', ['current'])],
      }),
    );

    await expect(
      loadStoryRuntimeSlice(storyFixture([interaction('current')]), 'current', ['current']),
    ).rejects.toThrow('runtime options returned 1 of 2 expected records');
  });

  it('rejects duplicate options returned by separate pages', async () => {
    vi.mocked(api.getStoryRuntimeSlice)
      .mockResolvedValueOnce(
        runtimeSlice({
          totalOptionCount: 2,
          hasMore: true,
          pageSize: 1,
          optionInteractionIds: ['option-1'],
          interactions: [interaction('option-1', ['current'])],
        }),
      )
      .mockResolvedValueOnce(
        runtimeSlice({
          page: 2,
          pageSize: 1,
          totalOptionCount: 2,
          optionInteractionIds: ['option-1'],
          interactions: [interaction('option-1', ['current'])],
        }),
      );

    await expect(
      loadStoryRuntimeSlice(storyFixture([interaction('current')]), 'current', ['current']),
    ).rejects.toThrow('runtime option pages contain duplicate interaction identifiers');
  });
});

function storyFixture(interactions: Interaction[]): Story {
  return {
    id: 'story-1',
    revision: 4,
    title: 'Runtime fixture',
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    interactions,
  };
}

function interaction(id: string, inputInteractionIds: string[] = []): Interaction {
  return {
    id,
    title: id,
    body: `${id} body`,
    position: { x: 0, y: 0 },
    triggers:
      inputInteractionIds.length > 0
        ? [{ id: `trigger-${id}`, inputInteractionIds, conditionGroups: [] }]
        : [],
  };
}

function runtimeSlice(overrides: Partial<StoryRuntimeSlice>): StoryRuntimeSlice {
  return {
    revision: 4,
    page: 1,
    pageSize: 100,
    totalOptionCount: 0,
    hasMore: false,
    optionInteractionIds: [],
    interactionReferences: [],
    interactions: [],
    ...overrides,
  };
}
