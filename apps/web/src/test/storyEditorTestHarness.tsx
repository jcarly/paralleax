/* eslint-disable react-refresh/only-export-components */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import {
  getStatAssignmentOwners,
  getStoryItemEntries,
  getTriggerConditionGroups,
  STORY_EDITOR_PAGE_SIZE,
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
    mockProgressiveStoryLoading();
    window.localStorage.clear();
    FakeEventSource.instances = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
    vi.mocked(api.getStoryHistory).mockResolvedValue({
      entries: [],
      canUndo: false,
      canRedo: false,
    });
  });
}

function mockProgressiveStoryLoading() {
  let loadedStory: Story | undefined;
  vi.mocked(api.getStoryEditorBootstrap).mockImplementation(async () => {
    loadedStory = cloneStory(await api.getStory('story-1'));
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
        graphDecorations: story.graphDecorations?.length ?? 0,
      },
      interactionCount: story.interactions.length,
      triggerCount: story.interactions.reduce(
        (count, interaction) => count + interaction.triggers.length,
        0,
      ),
    };
  });
  vi.mocked(api.getStoryEditorContextPage).mockImplementation(async (_id, page, pageSize) => {
    const story = requiredLoadedStory(loadedStory);
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
      graphDecorations: story.graphDecorations ?? [],
    };
  });
  vi.mocked(api.getStoryEditorInteractionPage).mockImplementation(async (_id, page, pageSize) => {
    const story = requiredLoadedStory(loadedStory);
    return {
      revision: story.revision ?? 1,
      page,
      pageSize: pageSize ?? STORY_EDITOR_PAGE_SIZE,
      hasMore: false,
      interactions: story.interactions.map(({ id, title, position, locationId }) => ({
        id,
        title,
        position,
        locationId,
      })),
    };
  });
  vi.mocked(api.getStoryEditorTriggerPage).mockImplementation(async (_id, page, pageSize) => {
    const story = requiredLoadedStory(loadedStory);
    return {
      revision: story.revision ?? 1,
      page,
      pageSize: pageSize ?? STORY_EDITOR_PAGE_SIZE,
      hasMore: false,
      triggers: story.interactions.flatMap((interaction) =>
        interaction.triggers.map(({ id, inputInteractionIds, position }) => ({
          id,
          inputInteractionIds,
          position,
          outputInteractionId: interaction.id,
        })),
      ),
    };
  });
  vi.mocked(api.getStoryEditorInteractionContentPage).mockImplementation(
    async (_id, page, pageSize) => {
      const story = requiredLoadedStory(loadedStory);
      return {
        revision: story.revision ?? 1,
        page,
        pageSize: pageSize ?? STORY_EDITOR_PAGE_SIZE,
        hasMore: false,
        interactions: story.interactions.map(
          ({
            id,
            body,
            durationMinutes,
            characterIds,
            statEffects,
            itemEffects,
            conditionalTextBlocks,
          }) => ({
            interactionId: id,
            body,
            durationMinutes,
            characterIds,
            statEffects,
            itemEffects,
            conditionalTextBlocks,
          }),
        ),
      };
    },
  );
  vi.mocked(api.getStoryEditorTriggerContentPage).mockImplementation(
    async (_id, page, pageSize) => {
      const story = requiredLoadedStory(loadedStory);
      return {
        revision: story.revision ?? 1,
        page,
        pageSize: pageSize ?? STORY_EDITOR_PAGE_SIZE,
        hasMore: false,
        triggers: story.interactions.flatMap((interaction) =>
          interaction.triggers.map((trigger) => ({
            triggerId: trigger.id,
            conditionGroups: getTriggerConditionGroups(trigger),
            appearanceProbability: trigger.appearanceProbability,
            timerSeconds: trigger.timerSeconds,
          })),
        ),
      };
    },
  );
}

function requiredLoadedStory(story: Story | undefined): Story {
  if (!story) throw new Error('The editor bootstrap must be loaded first.');
  return story;
}
