import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Story } from '@paralleax/shared';
import {
  api,
  chooseTriggerConditionType,
  cloneStory,
  renderEditor,
  setupStoryEditorTestSuite,
  storyWithThreeInteractions,
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

describe('StoryEditor triggers', () => {
  setupStoryEditorTestSuite();

  it('opens the trigger editor from a marker and updates that trigger conditions', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [
      { id: 'trigger-start', inputInteractionIds: [], conditions: [] },
      { id: 'trigger-edge', inputInteractionIds: ['interaction-1'], conditions: [] },
    ];
    const withCondition = structuredClone(story);
    withCondition.interactions[2].triggers[1].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(withCondition);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-3-trigger-edge'));

    expect(screen.getByTestId('flow-trigger-interaction-3-trigger-edge')).toHaveClass('selected');
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', 'trigger-edge', {
        conditionGroups: [
          {
            id: 'trigger-edge',
            conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
          },
        ],
      });
    });
  });

  it('keeps local interaction content when a trigger save returns stale interaction data', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const staleUpdatedStory = structuredClone(story);
    staleUpdatedStory.interactions[0].title = '';
    staleUpdatedStory.interactions[0].body = '';
    staleUpdatedStory.interactions[0].position = { x: 0, y: 0 };
    staleUpdatedStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    staleUpdatedStory.interactions[1].title = '';
    staleUpdatedStory.interactions[1].body = '';
    staleUpdatedStory.interactions[1].position = { x: 0, y: 0 };
    vi.mocked(api.updateTrigger).mockResolvedValue(staleUpdatedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        conditionGroups: [
          {
            id: 'trigger-2',
            conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
          },
        ],
      });
    });

    const firstNode = within(screen.getByTestId('flow-node-interaction-1')).getByTestId(
      'interaction-node',
    );
    const secondNode = within(screen.getByTestId('flow-node-interaction-2')).getByTestId(
      'interaction-node',
    );
    expect(within(firstNode).getByText('Original title')).toBeInTheDocument();
    expect(within(firstNode).getByText('Original content')).toBeInTheDocument();
    expect(within(secondNode).getByText('Second interaction')).toBeInTheDocument();
    expect(within(secondNode).getByText('Next content')).toBeInTheDocument();
  });

  it('merges a delayed trigger save into the latest local editor state', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    let resolveTriggerSave: (story: Story) => void = () => {};
    vi.mocked(api.updateTrigger).mockReturnValue(
      new Promise((resolve) => {
        resolveTriggerSave = resolve;
      }),
    );

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        conditionGroups: [
          {
            id: 'trigger-2',
            conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
          },
        ],
      });
    });

    await user.click(screen.getByTestId('flow-node-interaction-2'));
    const titleInput = screen.getByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Fresh second title' } });

    const staleUpdatedStory = structuredClone(story);
    staleUpdatedStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    staleUpdatedStory.interactions[1].title = '';
    staleUpdatedStory.interactions[1].body = '';

    await act(async () => {
      resolveTriggerSave(staleUpdatedStory);
    });

    const secondNode = within(screen.getByTestId('flow-node-interaction-2')).getByTestId(
      'interaction-node',
    );
    expect(within(secondNode).getByText('Fresh second title')).toBeInTheDocument();
    expect(within(secondNode).getByText('Next content')).toBeInTheDocument();
  });

  it('renders several graph links for the same multi-input trigger', async () => {
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers[0].inputInteractionIds = ['interaction-1', 'interaction-2'];

    await renderEditor(story);

    expect(screen.getByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
    expect(screen.getByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
    expect(screen.getByTestId('flow-trigger-interaction-3-trigger-3')).toBeInTheDocument();
  });

  it('shows the OR condition groups owned by one trigger in the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        appearanceProbability: 75,
        conditionGroups: [
          {
            id: 'group-a',
            conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
          },
          {
            id: 'group-b',
            conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
          },
        ],
      },
    ];

    await renderEditor(story);

    expect(screen.getAllByTestId(/^flow-trigger-interaction-2-/)).toHaveLength(1);

    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));

    expect(screen.getByText('Condition group 1')).toBeInTheDocument();
    expect(screen.getByText('Condition group 2')).toBeInTheDocument();
    expect(screen.getByText('OR')).toHaveClass('or-divider');
    const deleteGroupButtons = screen.getAllByRole('button', { name: 'Delete this OR group' });
    expect(deleteGroupButtons).toHaveLength(2);
    expect(deleteGroupButtons[0]).toHaveTextContent('×');
    expect(screen.getByLabelText('Appearance probability')).toHaveValue(75);
    expect(screen.getByRole('button', { name: 'Delete trigger' })).toHaveClass(
      'trigger-delete-action',
    );
  });

  it('deletes one OR condition group from the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditionGroups: [
          {
            id: 'group-a',
            conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
          },
          {
            id: 'group-b',
            conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
          },
        ],
      },
    ];
    const withoutFirstGroup = structuredClone(story);
    withoutFirstGroup.interactions[1].triggers[0].conditionGroups = [
      withoutFirstGroup.interactions[1].triggers[0].conditionGroups![1],
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(withoutFirstGroup);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));
    await user.click(screen.getAllByRole('button', { name: 'Delete this OR group' })[0]);

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-a', {
        conditionGroups: [
          {
            id: 'group-b',
            conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
          },
        ],
      });
    });
    expect(api.deleteTrigger).not.toHaveBeenCalled();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();
    expect(screen.getByTestId('flow-trigger-interaction-2-trigger-a')).toHaveClass('selected');
  });

  it('keeps distinct triggers separate even when they use the same input', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];
    const afterDelete = structuredClone(story);
    afterDelete.interactions[1].triggers = [afterDelete.interactions[1].triggers[1]];
    vi.mocked(api.deleteTrigger).mockResolvedValue(afterDelete);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));
    await user.click(screen.getByRole('button', { name: 'Delete trigger' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenCalledTimes(1);
      expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-a');
    });
    expect(screen.getByTestId('flow-trigger-interaction-2-trigger-b')).toBeInTheDocument();
  });

  it('adds an OR condition group from the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const withOrGroup = structuredClone(story);
    withOrGroup.interactions[1].triggers[0].conditionGroups = [
      { id: 'trigger-2', conditions: [] },
      { id: 'group-new', conditions: [] },
    ];
    delete withOrGroup.interactions[1].triggers[0].conditions;
    vi.mocked(api.updateTrigger).mockResolvedValue(withOrGroup);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    const addGroupButton = screen.getByRole('button', { name: 'Add OR condition group' });
    expect(addGroupButton).toHaveTextContent('+');
    expect(addGroupButton).toHaveClass('trigger-add-group');
    await user.click(addGroupButton);

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        conditionGroups: [
          { id: 'trigger-2', conditions: [] },
          { id: expect.any(String), conditions: [] },
        ],
      });
    });
    expect(api.addTrigger).not.toHaveBeenCalled();
    expect(await screen.findByText('OR')).toHaveClass('or-divider');
    expect(screen.getByText('Condition group 2')).toBeInTheDocument();
  });

  it('allows adding an OR condition group to a root trigger', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withOrGroup = structuredClone(story);
    withOrGroup.interactions[0].triggers[0].conditionGroups = [
      { id: 'trigger-1', conditions: [] },
      { id: 'group-new', conditions: [] },
    ];
    delete withOrGroup.interactions[0].triggers[0].conditions;
    vi.mocked(api.updateTrigger).mockResolvedValue(withOrGroup);
    await renderEditor(story);

    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Select root trigger',
      }),
    );

    const addGroupButton = screen.getByRole('button', { name: 'Add OR condition group' });
    expect(addGroupButton).toBeEnabled();
    await user.click(addGroupButton);
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
        conditionGroups: [
          { id: 'trigger-1', conditions: [] },
          { id: expect.any(String), conditions: [] },
        ],
      });
    });
  });

  it('adds, edits, and removes trigger conditions', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withCondition = structuredClone(story);
    withCondition.interactions[0].triggers[0].conditions = [
      { interactionId: 'interaction-2', hasBeenVisited: true },
    ];
    const notVisitedCondition = structuredClone(story);
    notVisitedCondition.interactions[0].triggers[0].conditions = [
      { interactionId: 'interaction-2', hasBeenVisited: false },
    ];
    const withoutCondition = structuredClone(story);

    vi.mocked(api.updateTrigger)
      .mockResolvedValueOnce(withCondition)
      .mockResolvedValueOnce(notVisitedCondition)
      .mockResolvedValueOnce(withoutCondition);

    await renderEditor(story);
    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Select root trigger',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        conditionGroups: [
          {
            id: 'trigger-1',
            conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
          },
        ],
      });
    });

    await screen.findByDisplayValue('has been visited');
    await user.selectOptions(screen.getByDisplayValue('has been visited'), 'not-visited');
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        conditionGroups: [
          {
            id: 'trigger-1',
            conditions: [{ interactionId: 'interaction-2', hasBeenVisited: false }],
          },
        ],
      });
    });

    await user.click(screen.getByRole('button', { name: '\u00d7' }));
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        conditionGroups: [{ id: 'trigger-1', conditions: [] }],
      });
    });
  });

  it('keeps trigger conditions out of the interaction inspector', async () => {
    const story = storyWithTwoInteractions();

    await renderEditor(story);
    await userEvent.click(screen.getByTestId('flow-node-interaction-2'));

    expect(screen.queryByRole('heading', { name: 'Path conditions' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Second interaction');
  });

  it('only shows the inspector while an interaction or trigger is selected', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();

    await renderEditor(story);

    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Original title');

    await user.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-pane'));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  });

  it('edits root trigger conditions from the root trigger marker', async () => {
    await renderEditor();
    await userEvent.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Select root trigger',
      }),
    );

    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete trigger' })).toHaveClass(
      'trigger-delete-action',
    );
  });

  it('turns the last linked trigger into a root trigger when deleting the trigger', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const rootTriggerStory = structuredClone(story);
    rootTriggerStory.interactions[1].triggers[0].inputInteractionIds = [];
    vi.mocked(api.deleteTrigger).mockResolvedValue(rootTriggerStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Delete trigger' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2');
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
  });

  it('removes a link and keeps the trigger as a root trigger', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutInput = structuredClone(story);
    withoutInput.interactions[1].triggers[0].inputInteractionIds = [];
    vi.mocked(api.updateTrigger).mockResolvedValue(withoutInput);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: [],
      });
    });
    expect(api.deleteTrigger).not.toHaveBeenCalled();
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
  });

  it('deletes only the selected input link when a trigger has several inputs', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers[0].inputInteractionIds = ['interaction-1', 'interaction-3'];
    const withoutSelectedInput = structuredClone(story);
    withoutSelectedInput.interactions[1].triggers[0].inputInteractionIds = ['interaction-3'];
    vi.mocked(api.updateTrigger).mockResolvedValue(withoutSelectedInput);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-3'],
      });
    });
    expect(api.deleteTrigger).not.toHaveBeenCalled();
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('deletes an input from only the trigger represented by the selected edge', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];
    const afterInputDelete = structuredClone(story);
    afterInputDelete.interactions[1].triggers[0].inputInteractionIds = [];
    vi.mocked(api.updateTrigger).mockResolvedValue(afterInputDelete);

    await renderEditor(story);
    await user.click(screen.getAllByTestId('delete-link-interaction-1-interaction-2')[0]);

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-a', {
        inputInteractionIds: [],
      });
    });
    expect(api.updateTrigger).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('flow-edge-interaction-1-interaction-2')).toBeInTheDocument();
  });

  it('does not restore a deleted link when a later interaction move returns stale trigger data', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutLink = structuredClone(story);
    withoutLink.interactions[1].triggers[0].inputInteractionIds = [];
    let resolveLinkDeletion: (story: Story) => void = () => {};
    vi.mocked(api.updateTrigger).mockReturnValue(
      new Promise((resolve) => {
        resolveLinkDeletion = resolve;
      }),
    );
    vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
      revision: 2,
      updatedAt: story.updatedAt,
    });

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('drag-node-interaction-2'));

    await waitFor(() => {
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: [{ interactionId: 'interaction-2', position: { x: 105, y: 285 } }],
        triggerUpdates: [],
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();

    await act(async () => {
      resolveLinkDeletion(withoutLink);
    });
  });

  it('does not render a blank page when the selected interaction has no trigger', async () => {
    const storyWithoutTrigger = cloneStory();
    storyWithoutTrigger.interactions[0].triggers = [];

    await renderEditor(storyWithoutTrigger);
    await userEvent.click(screen.getByTestId('flow-node-interaction-1'));

    expect(screen.getByLabelText('Title')).toHaveValue('Original title');
    expect(screen.getByRole('button', { name: 'Delete interaction' })).toBeInTheDocument();
  });
});
