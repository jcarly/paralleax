/* eslint-disable react-refresh/only-export-components */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import {
  type GraphDecorationMutationResult,
  type InteractionMutationResult,
  type Story,
  type TriggerMutationResult,
} from '@paralleax/shared';
import { api } from '../api';
import { StoryEditor } from '../pages/StoryEditor';
import { FakeEventSource } from './FakeEventSource';

export { api, FakeEventSource, StoryEditor };

export const baseStory: Story = {
  id: 'story-1',
  title: 'Test story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
  capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
  interactions: [
    {
      id: 'interaction-1',
      title: 'Original title',
      body: 'Original content',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
  ],
};

export function cloneStory(story: Story = baseStory): Story {
  return structuredClone(story);
}

export function interactionMutation(
  story: Story,
  interactionId: string,
): InteractionMutationResult {
  const interaction = story.interactions.find(({ id }) => id === interactionId);
  if (!interaction) throw new Error(`Missing interaction ${interactionId} in test fixture`);
  return {
    interaction: structuredClone(interaction),
    revision: story.revision ?? 2,
    updatedAt: story.updatedAt,
  };
}

export function triggerMutation(
  story: Story,
  interactionId: string,
  triggerId: string,
): TriggerMutationResult {
  const trigger = story.interactions
    .find(({ id }) => id === interactionId)
    ?.triggers.find(({ id }) => id === triggerId);
  if (!trigger) throw new Error(`Missing trigger ${triggerId} in test fixture`);
  return {
    interactionId,
    trigger: structuredClone(trigger),
    revision: story.revision ?? 2,
    updatedAt: story.updatedAt,
  };
}

export function graphDecorationMutation(
  story: Story,
  decorationId: string,
): GraphDecorationMutationResult {
  const decoration = story.graphDecorations?.find(({ id }) => id === decorationId);
  if (!decoration) throw new Error(`Missing graph decoration ${decorationId} in test fixture`);
  return {
    decoration: structuredClone(decoration),
    revision: story.revision ?? 2,
    updatedAt: story.updatedAt,
  };
}

export function storyWithTwoInteractions(): Story {
  return {
    ...cloneStory(),
    interactions: [
      cloneStory().interactions[0],
      {
        id: 'interaction-2',
        title: 'Second interaction',
        body: 'Next content',
        position: { x: 80, y: 270 },
        triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
      },
    ],
  };
}

export function storyWithThreeInteractions(): Story {
  const story = storyWithTwoInteractions();
  story.interactions.push({
    id: 'interaction-3',
    title: 'Third interaction',
    body: 'Another child',
    position: { x: 320, y: 420 },
    triggers: [{ id: 'trigger-3', inputInteractionIds: [], conditions: [] }],
  });
  return story;
}

export async function renderEditor(story: Story = baseStory) {
  vi.mocked(api.getStory).mockResolvedValue(cloneStory(story));

  render(
    <MemoryRouter initialEntries={['/stories/story-1/edit']}>
      <Routes>
        <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText('Original title', undefined, { timeout: 5_000 });
}

export async function chooseTriggerConditionType(
  user: ReturnType<typeof userEvent.setup>,
  typeName: string,
) {
  const picker = screen.getByRole('group', { name: 'Condition type' });
  await user.click(within(picker).getByRole('button', { name: typeName }));
}

export function setupStoryEditorTestSuite() {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    FakeEventSource.instances = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  });
}
