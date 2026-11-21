import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { getStoryGraphClickCreationPosition } from '../storyGraphCreationLayout';
import * as elkLayout from '../storyGraphElkLayout';
import {
  api,
  baseStory,
  cloneStory,
  renderEditor,
  setupStoryEditorTestSuite,
  stubEditorDomGeometry,
  storyWithTwoInteractions,
} from '../test/storyEditorTestHarness';
import { reactFlowFitViewMock } from '../test/reactFlowMock';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

function requirePosition<T>(position: T | undefined) {
  if (position === undefined) {
    throw new Error('Expected a graph creation position.');
  }
  return position;
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

it('creates root and child interactions', async () => {
  const user = userEvent.setup();
  const rootPosition = requirePosition(
    await getStoryGraphClickCreationPosition(baseStory, { kind: 'root' }),
  );
  const withRoot = cloneStory();
  withRoot.interactions.push({
    id: 'interaction-root',
    title: 'Created root',
    body: 'Root body',
    position: rootPosition,
    triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
  });
  const childPosition = requirePosition(
    await getStoryGraphClickCreationPosition(withRoot, {
      kind: 'child',
      sourceId: 'interaction-1',
    }),
  );
  const withChild = storyWithTwoInteractions();
  withChild.interactions[1].position = childPosition;
  vi.mocked(api.createInteraction).mockResolvedValueOnce(withRoot).mockResolvedValueOnce(withChild);

  await renderEditor();

  await user.click(screen.getByRole('button', { name: 'Add root' }));
  expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: rootPosition });
  expect(await screen.findByText('Created root')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Created root')).toBeInTheDocument();
  });

  await user.click(
    within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
      name: 'Create child interaction',
    }),
  );
  expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
    parentId: 'interaction-1',
    position: childPosition,
  });
  await waitFor(() => {
    expect(reactFlowFitViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [{ id: 'interaction-2' }] }),
    );
  });
  // The Inspector renders the new selection after the viewport request.
  expect(
    await screen.findByRole('button', { name: 'Title: Second interaction' }),
  ).toBeInTheDocument();
});

it('adds an Inspector option through canonical child Interaction creation', async () => {
  const user = userEvent.setup();
  const position = requirePosition(
    await getStoryGraphClickCreationPosition(baseStory, {
      kind: 'child',
      sourceId: 'interaction-1',
    }),
  );
  vi.mocked(api.createInteraction).mockResolvedValue(storyWithTwoInteractions());

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));
  await user.click(screen.getByRole('button', { name: 'Add option' }));

  await waitFor(() => {
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position,
    });
  });
  expect(api.addTrigger).not.toHaveBeenCalled();
});

it('uses measured interaction dimensions when calculating a child position', async () => {
  const user = userEvent.setup();
  await renderEditor(storyWithTwoInteractions());

  await user.click(screen.getByTestId('measure-node-interaction-1'));
  await user.click(
    within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
      name: 'Create child interaction',
    }),
  );

  await waitFor(() => {
    expect(elkLayout.computeStoryGraphElkLayout).toHaveBeenCalled();
  });
  const calls = vi.mocked(elkLayout.computeStoryGraphElkLayout).mock.calls;
  const layoutOptions = calls[calls.length - 1]?.[1];
  expect(layoutOptions?.interactionSizes?.get('interaction-1')).toEqual({
    width: 500,
    height: 320,
  });
});

it('links the test action to the selected interaction when one is selected', async () => {
  const user = userEvent.setup();
  await renderEditor(storyWithTwoInteractions());

  const testLink = screen.getByRole('link', { name: 'Test from start' });
  expect(testLink).toHaveAttribute('href', '/stories/story-1/play?mode=simulation');

  await user.click(screen.getByTestId('flow-node-interaction-2'));

  expect(screen.getByRole('link', { name: 'Test from start' })).toHaveAttribute(
    'href',
    '/stories/story-1/play?mode=simulation',
  );
  expect(screen.getByRole('link', { name: 'Test from current interaction' })).toHaveAttribute(
    'href',
    '/stories/story-1/play?mode=simulation&startInteractionId=interaction-2',
  );
});

it('does not render transient trigger input handles while a connection is being created', async () => {
  await renderEditor(storyWithTwoInteractions());

  expect(screen.queryByTitle('Create new trigger')).not.toBeInTheDocument();

  await userEvent.click(screen.getByTestId('begin-source-interaction-1'));

  await waitFor(() => {
    expect(screen.queryByTitle('Create new trigger')).not.toBeInTheDocument();
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
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Title: Dropped output' })).toBeInTheDocument();
  });
});

it('creates a child interaction from the hovered node action', async () => {
  const position = requirePosition(
    await getStoryGraphClickCreationPosition(baseStory, {
      kind: 'child',
      sourceId: 'interaction-1',
    }),
  );
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

it('uses the ELK coordinate before creating a child interaction', async () => {
  const elkPosition = { x: 680, y: 540 };
  vi.mocked(elkLayout.computeStoryGraphElkLayout).mockResolvedValueOnce({
    interactionUpdates: [
      {
        interactionId: '__paralleax_new_interaction__',
        position: elkPosition,
      },
    ],
    triggerUpdates: [],
    affectedNodeIds: ['__paralleax_new_interaction__'],
  });
  const withNewChild = storyWithTwoInteractions();
  withNewChild.interactions[1].position = elkPosition;
  vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

  await renderEditor();
  await userEvent.click(
    within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
      name: 'Create child interaction',
    }),
  );

  await waitFor(() => {
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position: elkPosition,
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
    });
    expect(api.updateTrigger).not.toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Title: Dropped input' })).toBeInTheDocument();
  });
});

it('creates a parent interaction from the hovered node action', async () => {
  const story = storyWithTwoInteractions();
  const position = requirePosition(
    await getStoryGraphClickCreationPosition(story, {
      kind: 'parent',
      targetId: 'interaction-2',
    }),
  );
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
  await userEvent.click(
    within(node).getByRole('button', {
      name: 'Create a source interaction or a new trigger connection',
    }),
  );

  await waitFor(() => {
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      position,
    });
    expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
      inputInteractionIds: ['interaction-parent'],
    });
    expect(api.updateTrigger).not.toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Title: Created source' })).toBeInTheDocument();
  });
});

it('places a new child interaction below occupied vertical outputs instead of overlapping them', async () => {
  const user = userEvent.setup();
  const story = storyWithTwoInteractions();
  story.interactions[1].position = { x: 80, y: 270 };
  const position = requirePosition(
    await getStoryGraphClickCreationPosition(story, {
      kind: 'child',
      sourceId: 'interaction-1',
    }),
  );
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
