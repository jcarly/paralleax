/* eslint-disable react-refresh/only-export-components */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import {
  doesTriggerInputMatch,
  getTriggerConditions,
  getStatAssignmentOwners,
  getStoryItemEntries,
  STORY_EDITOR_PAGE_SIZE,
  type Story,
} from '@paralleax/shared';
import { api } from '../api';
import { StoryPlayer } from '../pages/StoryPlayer';
import { FakeEventSource } from './FakeEventSource';

export { api, FakeEventSource, StoryPlayer };

export const story: Story = {
  id: 'story-1',
  title: 'Playable story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
  capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
  interactions: [
    {
      id: 'start',
      title: 'Start',
      body: 'You arrive.',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'next',
      title: 'Next',
      body: 'You continue.',
      position: { x: 100, y: 0 },
      triggers: [{ id: 'trigger-next', inputInteractionIds: ['start'], conditions: [] }],
    },
    {
      id: 'hidden',
      title: 'Secret',
      body: 'You found a secret.',
      position: { x: 200, y: 0 },
      triggers: [
        {
          id: 'trigger-hidden',
          inputInteractionIds: ['next'],
          conditions: [{ interactionId: 'start', hasBeenVisited: true }],
        },
      ],
    },
  ],
};

export async function renderPlayer(initialEntry = '/stories/story-1/play', storyFixture = story) {
  vi.mocked(api.getStory).mockResolvedValue(structuredClone(storyFixture));
  vi.mocked(api.getReaderProgress).mockResolvedValue(null);
  vi.mocked(api.saveReaderProgress).mockResolvedValue({
    state: {
      version: 1,
      journeyInteractionIds: [],
      currentInteractionId: null,
      visitedInteractionIds: [],
      currentDateTime: '2000-01-03T08:00',
      currentLocationId: null,
      statValues: {},
      ownedItemIds: [],
    },
    updatedAt: '2026-07-27T09:00:00.000Z',
  });
  vi.mocked(api.deleteReaderProgress).mockResolvedValue(undefined);
  vi.mocked(api.listReaderSaves).mockResolvedValue([]);

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/stories/:storyId/play" element={<StoryPlayer currentUserId="owner-1" />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText(/Paralleax (Reader|Preview)/);
}

export function setupStoryPlayerTestSuite() {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mockStoryRuntimeLoading();
    FakeEventSource.instances = [];
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  });
}

function mockStoryRuntimeLoading() {
  let loadedStory: Story | undefined;
  vi.mocked(api.getStoryRuntimeBootstrap).mockImplementation(async () => {
    loadedStory = structuredClone(await api.getStory('story-1'));
    const story = loadedStory;
    return {
      id: story.id,
      revision: story.revision ?? 1,
      title: story.title,
      startDateTime: story.startDateTime,
      access: story.access,
      capabilities: story.capabilities,
      owner: story.owner,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
      contextCounts: {
        locations: story.locations?.length ?? 0,
        characters: story.characters?.length ?? 0,
        statDefinitions: story.statDefinitions?.length ?? 0,
        statAssignments: getStatAssignmentOwners(story).reduce(
          (count, owner) => count + owner.assignments.length,
          0,
        ),
        itemDefinitions: story.itemDefinitions?.length ?? 0,
        itemInstances: getStoryItemEntries(story).length,
        graphDecorations: 0,
      },
      interactionCount: story.interactions.length,
      triggerCount: story.interactions.reduce(
        (count, interaction) => count + interaction.triggers.length,
        0,
      ),
    };
  });
  vi.mocked(api.getStoryRuntimeContextPage).mockImplementation(async (_id, page, pageSize) => {
    const story = requiredRuntimeStory(loadedStory);
    return {
      revision: story.revision ?? 1,
      page,
      pageSize: pageSize ?? STORY_EDITOR_PAGE_SIZE,
      hasMore: false,
      locations: story.locations ?? [],
      characters: story.characters ?? [],
      statDefinitions: story.statDefinitions ?? [],
      statAssignments: getStatAssignmentOwners(story).flatMap((owner) =>
        owner.assignments.map((assignment) => ({
          ...assignment,
          ownerType: owner.ownerType,
          ownerId: owner.ownerId,
        })),
      ),
      itemDefinitions: story.itemDefinitions ?? [],
      itemInstances: getStoryItemEntries(story).map(({ ownerType, ownerId, item }) => ({
        ...item,
        ownerType,
        ownerId,
      })),
      graphDecorations: [],
    };
  });
  vi.mocked(api.getStoryRuntimeSlice).mockImplementation(async (_id, request = {}) => {
    const story = requiredRuntimeStory(loadedStory);
    const candidates =
      request.includeOptions === false
        ? []
        : story.interactions.filter((interaction) =>
            interaction.triggers.some((trigger) =>
              doesTriggerInputMatch(trigger, request.currentInteractionId ?? null),
            ),
          );
    const page = request.page ?? 1;
    const pageSize = request.pageSize ?? STORY_EDITOR_PAGE_SIZE;
    const options = candidates.slice((page - 1) * pageSize, page * pageSize);
    const optionIds = new Set(options.map(({ id }) => id));
    const requestedIds = new Set(request.interactionIds ?? []);
    const referencedIds = new Set(
      options.flatMap((interaction) =>
        interaction.triggers.flatMap((trigger) =>
          getTriggerConditions(trigger).flatMap((condition) =>
            'interactionId' in condition ? [condition.interactionId] : [],
          ),
        ),
      ),
    );
    return {
      revision: story.revision ?? 1,
      page,
      pageSize,
      totalOptionCount: candidates.length,
      hasMore: page * pageSize < candidates.length,
      optionInteractionIds: [...optionIds],
      interactionReferences: story.interactions
        .filter(({ id }) => referencedIds.has(id))
        .map(({ id, title }) => ({ id, title })),
      interactions: story.interactions
        .filter(({ id }) => optionIds.has(id) || requestedIds.has(id))
        .map((interaction) => ({
          ...structuredClone(interaction),
          triggers: optionIds.has(interaction.id)
            ? interaction.triggers.filter((trigger) =>
                doesTriggerInputMatch(trigger, request.currentInteractionId ?? null),
              )
            : [],
        })),
    };
  });
}

function requiredRuntimeStory(story: Story | undefined): Story {
  if (!story) throw new Error('The runtime bootstrap must be loaded first.');
  return story;
}
