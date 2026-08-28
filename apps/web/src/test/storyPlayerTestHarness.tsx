/* eslint-disable react-refresh/only-export-components */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
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
    FakeEventSource.instances = [];
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  });
}
