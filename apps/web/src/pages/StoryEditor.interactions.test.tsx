import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Story } from '@paralleax/shared';
import { getStoryGraphClickCreationPosition } from '../storyGraphCreationLayout';
import {
  api,
  baseStory,
  cloneStory,
  interactionMutation,
  renderEditor,
  setupStoryEditorTestSuite,
  storyWithTwoInteractions,
} from '../test/storyEditorTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

describe('StoryEditor interactions', () => {
  setupStoryEditorTestSuite();

  it('creates root and child interactions', async () => {
    const user = userEvent.setup();
    const rootPosition = getStoryGraphClickCreationPosition(baseStory, { kind: 'root' })!;
    const withRoot = cloneStory();
    withRoot.interactions.push({
      id: 'interaction-root',
      title: 'Created root',
      body: 'Root body',
      position: rootPosition,
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    });
    const childPosition = getStoryGraphClickCreationPosition(withRoot, {
      kind: 'child',
      sourceId: 'interaction-1',
    })!;
    const withChild = storyWithTwoInteractions();
    withChild.interactions[1].position = childPosition;
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withRoot)
      .mockResolvedValueOnce(withChild);

    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add root' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: rootPosition });
    expect(await screen.findByText('Created root')).toBeInTheDocument();

    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Create child interaction',
      }),
    );
    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'interaction-1',
      position: childPosition,
    });
  });

  it('links the test action to the selected interaction when one is selected', async () => {
    const user = userEvent.setup();
    await renderEditor(storyWithTwoInteractions());

    const testLink = screen.getByRole('link', { name: 'Test' });
    expect(testLink).toHaveAttribute('href', '/stories/story-1/play?mode=simulation');

    await user.click(screen.getByTestId('flow-node-interaction-2'));

    expect(screen.getByRole('link', { name: 'Test from current interaction' })).toHaveAttribute(
      'href',
      '/stories/story-1/play?mode=simulation&startInteractionId=interaction-2',
    );
  });

  it('only reveals new trigger input handles while a connection is being created', async () => {
    await renderEditor(storyWithTwoInteractions());

    const hiddenHandles = screen.getAllByTitle('Create new trigger');
    expect(hiddenHandles.length).toBeGreaterThan(0);
    hiddenHandles.forEach((handle) => expect(handle).not.toHaveClass('is-visible'));

    await userEvent.click(screen.getByTestId('begin-source-interaction-1'));

    await waitFor(() => {
      screen
        .getAllByTitle('Create new trigger')
        .forEach((handle) => expect(handle).toHaveClass('is-visible'));
    });
  });

  it('creates a child interaction when a source connection is dropped on empty canvas', async () => {
    const story = storyWithTwoInteractions();
    const withNewChild = structuredClone(story);
    withNewChild.interactions.push({
      id: 'interaction-3',
      title: 'Dropped output',
      body: 'Created from source drop',
      position: { x: 420, y: 412 },
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor(story);
    fireEvent.click(screen.getByTestId('drop-source-interaction-1'), {
      clientX: 580,
      clientY: 452,
    });

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        parentId: 'interaction-1',
        position: { x: 425, y: 412 },
      });
    });
  });

  it('creates a child interaction from the hovered node action', async () => {
    const position = getStoryGraphClickCreationPosition(baseStory, {
      kind: 'child',
      sourceId: 'interaction-1',
    })!;
    const withNewChild = storyWithTwoInteractions();
    withNewChild.interactions[1].position = position;
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor();
    const node = screen.getByTestId('flow-node-interaction-1');
    await userEvent.click(within(node).getByRole('button', { name: 'Create child interaction' }));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        parentId: 'interaction-1',
        position,
      });
    });
  });

  it('creates a parent interaction when a target connection is dropped on empty canvas', async () => {
    const story = storyWithTwoInteractions();
    const withParent = structuredClone(story);
    withParent.interactions.push({
      id: 'interaction-parent',
      title: 'Dropped input',
      body: 'Created from target drop',
      position: { x: 160, y: 172 },
      triggers: [{ id: 'trigger-parent', inputInteractionIds: [], conditions: [] }],
    });
    const withTrigger = structuredClone(withParent);
    withTrigger.interactions[1].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[1].triggers[1].inputInteractionIds = ['interaction-parent'];
    vi.mocked(api.createInteraction).mockResolvedValue(withParent);
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    fireEvent.click(screen.getByTestId('drop-target-interaction-2'), {
      clientX: 320,
      clientY: 328,
    });

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        position: { x: 165, y: 172 },
      });
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-parent'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
  });

  it('creates a parent interaction from the hovered node action', async () => {
    const story = storyWithTwoInteractions();
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'parent',
      targetId: 'interaction-2',
    })!;
    const withParent = structuredClone(story);
    withParent.interactions.push({
      id: 'interaction-parent',
      title: 'Created source',
      body: 'Source body',
      position,
      triggers: [{ id: 'trigger-parent', inputInteractionIds: [], conditions: [] }],
    });
    const withTrigger = structuredClone(withParent);
    withTrigger.interactions[1].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[1].triggers[1].inputInteractionIds = ['interaction-parent'];
    vi.mocked(api.createInteraction).mockResolvedValue(withParent);
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    const node = screen.getByTestId('flow-node-interaction-2');
    await userEvent.click(within(node).getByRole('button', { name: 'Create source interaction' }));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        position,
      });
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-parent'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
  });

  it('places a new child interaction below occupied vertical outputs instead of overlapping them', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.interactions[1].position = { x: 80, y: 270 };
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'child',
      sourceId: 'interaction-1',
    })!;
    const withNewChild = structuredClone(story);
    withNewChild.interactions.push({
      id: 'interaction-3',
      title: 'New output',
      body: 'Additional output',
      position,
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor(story);
    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Create child interaction',
      }),
    );

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position,
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

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'New title');
    await user.tab();

    expect(await screen.findByDisplayValue('New title')).toBeInTheDocument();
    expect(screen.getByText('New title')).toBeInTheDocument();
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

    const bodyInput = screen.getByLabelText('Content');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Long new content');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      body: 'Long new content',
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Content')).toHaveTextContent('Long new content'),
    );
  });

  it('serializes title and body saves so reopening keeps both edits', async () => {
    let resolveTitleSave!: (story: Story) => void;
    let resolveBodySave!: (story: Story) => void;
    vi.mocked(api.updateInteraction)
      .mockImplementationOnce(() => new Promise<Story>((resolve) => (resolveTitleSave = resolve)))
      .mockImplementationOnce(() => new Promise<Story>((resolve) => (resolveBodySave = resolve)));

    await renderEditor();
    fireEvent.click(screen.getByTestId('flow-node-interaction-1'));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Saved title' } });
    fireEvent.blur(screen.getByLabelText('Title'));
    const content = screen.getByLabelText('Content');
    content.innerHTML = 'Saved content';
    fireEvent.input(content);
    fireEvent.blur(content);

    await waitFor(() => expect(api.updateInteraction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status', { name: 'Story save status' })).toHaveTextContent('Saving…');
    expect(api.updateInteraction).toHaveBeenNthCalledWith(1, 'story-1', 'interaction-1', {
      title: 'Saved title',
    });

    const titleStory = cloneStory();
    titleStory.interactions[0].title = 'Saved title';
    await act(async () => resolveTitleSave(titleStory));

    await waitFor(() => expect(api.updateInteraction).toHaveBeenCalledTimes(2));
    expect(api.updateInteraction).toHaveBeenNthCalledWith(2, 'story-1', 'interaction-1', {
      body: 'Saved content',
    });

    const fullySavedStory = cloneStory();
    fullySavedStory.interactions[0].title = 'Saved title';
    fullySavedStory.interactions[0].body = 'Saved content';
    await act(async () => resolveBodySave(fullySavedStory));

    expect(await screen.findByDisplayValue('Saved title')).toBeInTheDocument();
    expect(screen.getByLabelText('Content')).toHaveTextContent('Saved content');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('shows a recoverable error when an interaction save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateInteraction).mockRejectedValueOnce(new Error('Database unavailable'));

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Unsaved title');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.getByRole('status', { name: 'Story save status' })).toHaveTextContent(
      'Save failed',
    );

    await user.click(screen.getByRole('button', { name: 'Reload story' }));
    await waitFor(() => expect(api.getStory).toHaveBeenCalledTimes(2));
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

  it('moves every trigger variant represented by one grouped marker', async () => {
    const story = storyWithTwoInteractions();
    story.interactions[1].triggers[0].position = { x: 400, y: 300 };
    story.interactions[1].triggers.push({
      id: 'trigger-variant',
      inputInteractionIds: ['interaction-1'],
      conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      position: { x: 400, y: 300 },
    });
    const movedStory = structuredClone(story);
    movedStory.interactions[1].triggers.forEach((trigger) => {
      trigger.position = { x: 425, y: 315 };
    });
    vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
      revision: 2,
      updatedAt: movedStory.updatedAt,
    });

    await renderEditor(story);
    await userEvent.click(screen.getByTestId('drag-node-trigger:interaction-2:trigger-2'));

    await waitFor(() =>
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: [],
        triggerUpdates: [
          {
            interactionId: 'interaction-2',
            triggerIds: ['trigger-2', 'trigger-variant'],
            position: { x: 425, y: 315 },
          },
        ],
      }),
    );
  });

  it('deletes the selected interaction', async () => {
    const user = userEvent.setup();
    const afterDelete = cloneStory();
    afterDelete.interactions = [];
    vi.mocked(api.deleteInteraction).mockResolvedValue(afterDelete);

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
});
