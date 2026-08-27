import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  api,
  renderEditor,
  setupStoryEditorTestSuite,
  storyWithThreeInteractions,
  storyWithTwoInteractions,
  triggerMutation,
} from '../test/storyEditorTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

describe('StoryEditor connections', () => {
  setupStoryEditorTestSuite();

  it('persists a canvas connection as a trigger input', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const withTrigger = structuredClone(story);
    withTrigger.interactions[2].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[2].triggers[1].inputInteractionIds = ['interaction-1'];
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-1-interaction-3'));
    await user.click(await screen.findByRole('button', { name: 'Create a new trigger' }));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
  });

  it('creates a trigger before persisting a canvas connection when the target has none', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.interactions[1].triggers = [];
    const withTrigger = structuredClone(story);
    withTrigger.interactions[1].triggers = [
      { id: 'trigger-new', inputInteractionIds: [], conditions: [] },
    ];
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[1].triggers[0].inputInteractionIds = ['interaction-1'];
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-2')).toBeInTheDocument();
  });

  it('creates a dedicated trigger for a new canvas connection without changing existing linked triggers', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [
      {
        id: 'trigger-existing',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      },
    ];
    const withNewTrigger = structuredClone(story);
    withNewTrigger.interactions[2].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withNewTrigger);
    connectedStory.interactions[2].triggers[1].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-2-interaction-3'));
    await user.click(await screen.findByRole('button', { name: 'Create a new trigger' }));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
  });

  it('can add a canvas connection to an existing trigger from the connection choice', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const connectedStory = structuredClone(story);
    connectedStory.interactions[1].triggers[0].inputInteractionIds.push('interaction-3');
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-3-interaction-2'));
    expect(await screen.findByRole('dialog', { name: 'Connect interactions' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to condition group 1' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [],
      });
    });
    expect(api.addTrigger).not.toHaveBeenCalled();
    expect(await screen.findByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('adds a source to an existing trigger when the connection is dropped on its marker', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers[0].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    const connectedStory = structuredClone(story);
    connectedStory.interactions[1].triggers[0].inputInteractionIds = [
      'interaction-1',
      'interaction-3',
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('drop-source-interaction-3-on-trigger-interaction-2'));

    await waitFor(() => {
      expect(api.addTrigger).not.toHaveBeenCalled();
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });
    expect(screen.getByTestId('flow-edge-interaction-1-interaction-2')).toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('turns a root trigger into a linked trigger when a connection is dropped on its marker', async () => {
    const story = storyWithTwoInteractions();
    const linkedRoot = structuredClone(story);
    linkedRoot.interactions[0].triggers[0].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.updateTrigger).mockResolvedValue(linkedRoot);

    await renderEditor(story);
    fireEvent.click(screen.getByTestId('drop-source-interaction-2-on-root-trigger-interaction-1'));

    await waitFor(() => {
      expect(api.addTrigger).not.toHaveBeenCalled();
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
    });
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-1')).toBeInTheDocument();
  });

  it('does not restore a deleted link when another canvas connection is created from that interaction', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [];
    const withoutRootLink = structuredClone(story);
    withoutRootLink.interactions[1].triggers[0].inputInteractionIds = [];
    const staleWithNewTrigger = structuredClone(story);
    staleWithNewTrigger.interactions[2].triggers = [
      { id: 'trigger-new', inputInteractionIds: [], conditions: [] },
    ];
    const staleConnectedStory = structuredClone(staleWithNewTrigger);
    staleConnectedStory.interactions[2].triggers[0].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.addTrigger).mockResolvedValue(
      triggerMutation(staleConnectedStory, 'interaction-3', 'trigger-new'),
    );
    vi.mocked(api.updateTrigger).mockResolvedValueOnce(withoutRootLink);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: [],
        conditions: [],
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('connect-interaction-2-interaction-3'));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
  });
});
