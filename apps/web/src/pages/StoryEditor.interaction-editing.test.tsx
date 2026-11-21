import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { type Story } from '@paralleax/shared';
import * as elkLayout from '../storyGraphElkLayout';
import {
  api,
  baseStory,
  cloneStory,
  interactionMutation,
  leaveBodyEditor,
  renderEditor,
  setupStoryEditorTestSuite,
  storyWithTwoInteractions,
  stubEditorDomGeometry,
} from '../test/storyEditorTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

async function editInteractionTitleAndBody(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Title: Original title' }));
  const titleInput = screen.getByLabelText('Title');
  await user.clear(titleInput);
  await user.type(titleInput, 'Saved title');
  await user.tab();
  const inspector = screen.getByRole('complementary', { name: 'Inspector' });
  const bodyPreview = await within(inspector).findByText('Original content', undefined, {
    timeout: 10_000,
  });
  await user.click(bodyPreview);
  const content = await screen.findByRole('textbox', { name: 'Content' });
  await user.clear(content);
  await user.type(content, 'Saved content');
  await leaveBodyEditor(user);
}

setupStoryEditorTestSuite();

beforeEach(() => {
  stubEditorDomGeometry();
  vi.spyOn(elkLayout, 'computeStoryGraphElkLayout').mockResolvedValue({
    interactionUpdates: [],
    triggerUpdates: [],
    affectedNodeIds: [],
  });
});

it('keeps the editor visible when an interaction title is edited', async () => {
  const user = userEvent.setup();
  const updatedStory = cloneStory();
  updatedStory.interactions[0].title = 'New title';
  vi.mocked(api.updateInteraction).mockResolvedValue(
    interactionMutation(updatedStory, 'interaction-1'),
  );

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));

  await user.click(await screen.findByRole('button', { name: 'Title: Original title' }));
  const titleInput = screen.getByLabelText('Title');
  await user.clear(titleInput);
  await user.type(titleInput, 'New title');
  await user.tab();

  expect(screen.getByRole('button', { name: 'Title: New title' })).toBeInTheDocument();
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
    title: 'New title',
  });
});

it('updates interaction body from the inspector', async () => {
  const user = userEvent.setup();
  const updatedStory = cloneStory();
  updatedStory.interactions[0].body = 'Long new content';
  vi.mocked(api.updateInteraction).mockResolvedValue(updatedStory);

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));

  const inspector = screen.getByRole('complementary', { name: 'Inspector' });
  const bodyPreview = await within(inspector).findByText('Original content', undefined, {
    timeout: 10_000,
  });
  await user.click(bodyPreview);
  const bodyInput = await screen.findByRole('textbox', { name: 'Content' }, { timeout: 10_000 });
  await user.clear(bodyInput);
  await user.type(bodyInput, 'Long new content');
  await leaveBodyEditor(user);

  expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
    body: '<p>Long new content</p>',
  });
  await waitFor(() => {
    expect(
      within(inspector).getByRole('button', { name: 'Long new content Select to edit' }),
    ).toHaveTextContent('Long new content');
  });
});

it('serializes title and body saves so reopening keeps both edits', async () => {
  const user = userEvent.setup();
  let resolveTitleSave!: (story: Story) => void;
  let resolveBodySave!: (story: Story) => void;
  vi.mocked(api.updateInteraction)
    .mockImplementationOnce(() => new Promise<Story>((resolve) => (resolveTitleSave = resolve)))
    .mockImplementationOnce(() => new Promise<Story>((resolve) => (resolveBodySave = resolve)));

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));

  await editInteractionTitleAndBody(user);

  await waitFor(() => {
    expect(api.updateInteraction).toHaveBeenCalledTimes(1);
  });
  expect(screen.getByRole('status', { name: 'Saving…' })).toHaveAttribute('aria-label', 'Saving…');
  expect(api.updateInteraction).toHaveBeenNthCalledWith(1, 'story-1', 'interaction-1', {
    title: 'Saved title',
  });

  const titleStory = cloneStory();
  titleStory.interactions[0].title = 'Saved title';
  await act(async () => {
    resolveTitleSave(titleStory);
  });

  await waitFor(() => {
    expect(api.updateInteraction).toHaveBeenCalledTimes(2);
  });
  expect(api.updateInteraction).toHaveBeenNthCalledWith(2, 'story-1', 'interaction-1', {
    body: '<p>Saved content</p>',
  });

  const fullySavedStory = cloneStory();
  fullySavedStory.interactions[0].title = 'Saved title';
  fullySavedStory.interactions[0].body = '<p>Saved content</p>';
  await act(async () => {
    resolveBodySave(fullySavedStory);
  });

  expect(screen.getByRole('button', { name: 'Title: Saved title' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Saved content Select to edit' })).toHaveTextContent(
    'Saved content',
  );
  await waitFor(() => {
    expect(screen.queryByRole('status', { name: /Saving/ })).not.toBeInTheDocument();
  });
});

it('shows a recoverable error when an interaction save fails', async () => {
  const user = userEvent.setup();
  vi.mocked(api.updateInteraction).mockRejectedValueOnce(new Error('Database unavailable'));

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));
  await user.click(screen.getByRole('button', { name: 'Title: Original title' }));
  await user.clear(screen.getByLabelText('Title'));
  await user.type(screen.getByLabelText('Title'), 'Unsaved title');
  await user.tab();

  expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
  expect(screen.getByRole('status', { name: 'Save failed' })).toHaveAttribute(
    'aria-label',
    'Save failed',
  );

  await user.click(screen.getByRole('button', { name: 'Reload story' }));
  await waitFor(() => {
    expect(api.getStory).toHaveBeenCalledTimes(2);
  });
});

it('does not erase title or body when a drag save only returns a position update', async () => {
  const movedStory = cloneStory();
  movedStory.interactions[0].position = { x: 105, y: 135 };
  vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
    revision: 2,
    updatedAt: movedStory.updatedAt,
  });

  await renderEditor();

  const flowNode = screen.getByTestId('flow-node-interaction-1');
  await userEvent.click(screen.getByTestId('drag-node-interaction-1'));

  await waitFor(() => {
    expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
      interactionUpdates: [{ interactionId: 'interaction-1', position: { x: 105, y: 135 } }],
      triggerUpdates: [],
    });
  });

  const interactionNode = within(flowNode).getByTestId('interaction-node');
  expect(within(interactionNode).getByText('Original title')).toBeInTheDocument();
  expect(within(interactionNode).getByText('Original content')).toBeInTheDocument();
});

it('does not erase other interactions when one interaction is moved', async () => {
  const story = storyWithTwoInteractions();
  const staleMovedStory = structuredClone(story);
  staleMovedStory.interactions[0].position = { x: 105, y: 135 };
  staleMovedStory.interactions[1].title = '';
  staleMovedStory.interactions[1].body = '';
  vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
    revision: 2,
    updatedAt: staleMovedStory.updatedAt,
  });

  await renderEditor(story);

  const otherNode = screen.getByTestId('flow-node-interaction-2');
  await userEvent.click(screen.getByTestId('drag-node-interaction-1'));

  await waitFor(() => {
    expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
      interactionUpdates: [{ interactionId: 'interaction-1', position: { x: 105, y: 135 } }],
      triggerUpdates: [],
    });
  });

  const otherInteractionNode = within(otherNode).getByTestId('interaction-node');
  expect(within(otherInteractionNode).getByText('Second interaction')).toBeInTheDocument();
  expect(within(otherInteractionNode).getByText('Next content')).toBeInTheDocument();
});

it('saves a linked trigger position when its graph marker is moved', async () => {
  const story = storyWithTwoInteractions();
  story.interactions[1].triggers[0].position = { x: 400, y: 300 };
  const movedStory = structuredClone(story);
  movedStory.interactions[1].triggers[0].position = { x: 425, y: 315 };
  vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
    revision: 2,
    updatedAt: movedStory.updatedAt,
  });

  await renderEditor(story);
  expect(screen.getByTestId('flow-trigger-interaction-2-trigger-2')).not.toHaveClass('nodrag');
  await userEvent.click(screen.getByTestId('drag-node-trigger:interaction-2:trigger-2'));

  await waitFor(() => {
    expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
      interactionUpdates: [],
      triggerUpdates: [
        {
          interactionId: 'interaction-2',
          triggerIds: ['trigger-2'],
          position: { x: 425, y: 315 },
        },
      ],
    });
  });
});

it('moves only the selected trigger when another trigger uses the same input', async () => {
  const story = storyWithTwoInteractions();
  story.interactions[1].triggers[0].position = { x: 400, y: 300 };
  story.interactions[1].triggers.push({
    id: 'trigger-variant',
    inputInteractionIds: ['interaction-1'],
    conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
    position: { x: 400, y: 300 },
  });
  const movedStory = structuredClone(story);
  movedStory.interactions[1].triggers[0].position = { x: 425, y: 315 };
  vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
    revision: 2,
    updatedAt: movedStory.updatedAt,
  });

  await renderEditor(story);
  await userEvent.click(screen.getByTestId('drag-node-trigger:interaction-2:trigger-2'));

  await waitFor(() => {
    expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
      interactionUpdates: [],
      triggerUpdates: [
        {
          interactionId: 'interaction-2',
          triggerIds: ['trigger-2'],
          position: { x: 425, y: 315 },
        },
      ],
    });
  });
});

it('deletes the selected interaction', async () => {
  const user = userEvent.setup();
  vi.mocked(api.deleteInteraction).mockResolvedValue({
    interactionId: 'interaction-1',
    revision: 2,
    updatedAt: baseStory.updatedAt,
  });

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));
  await user.click(screen.getByRole('button', { name: 'Delete interaction' }));

  expect(api.deleteInteraction).toHaveBeenCalledWith('story-1', 'interaction-1');
  await waitFor(() => {
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  });
});

it('keeps an interaction when deletion is not confirmed', async () => {
  const user = userEvent.setup();
  vi.mocked(window.confirm).mockReturnValueOnce(false);

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));
  await user.click(screen.getByRole('button', { name: 'Delete interaction' }));

  expect(window.confirm).toHaveBeenCalled();
  expect(api.deleteInteraction).not.toHaveBeenCalled();
  expect(screen.getByTestId('flow-node-interaction-1')).toBeInTheDocument();
});
