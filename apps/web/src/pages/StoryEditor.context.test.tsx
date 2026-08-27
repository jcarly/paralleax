import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  api,
  baseStory,
  chooseTriggerConditionType,
  cloneStory,
  interactionMutation,
  renderEditor,
  setupStoryEditorTestSuite,
  StoryEditor,
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

describe('StoryEditor story context', () => {
  setupStoryEditorTestSuite();

  it('redirects a commenter without edit permission to the reader', async () => {
    const reviewStory = cloneStory();
    reviewStory.capabilities = {
      canRead: true,
      canEdit: false,
      canManage: false,
      canComment: true,
    };
    vi.mocked(api.getStory).mockResolvedValue(reviewStory);
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <Routes>
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
          <Route path="/stories/:storyId/play" element={<div>Reader route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Reader route')).toBeInTheDocument();
    expect(api.listCommentThreads).not.toHaveBeenCalled();
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
  });

  it('shows a loading error when the story cannot be loaded', async () => {
    vi.mocked(api.getStory).mockRejectedValue(new Error('Story not found'));

    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <Routes>
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Story not found')).toBeInTheDocument();
  });

  it('renames the story title', async () => {
    const user = userEvent.setup();
    const renamedStory = cloneStory();
    renamedStory.title = 'Renamed story';
    vi.mocked(api.renameStory).mockResolvedValue(renamedStory);

    await renderEditor();

    const storyTitleInput = screen.getByDisplayValue('Test story');
    await user.clear(storyTitleInput);
    await user.type(storyTitleInput, 'Renamed story');
    await user.tab();

    expect(api.renameStory).toHaveBeenCalledWith('story-1', 'Renamed story');
    expect(await screen.findByDisplayValue('Renamed story')).toBeInTheDocument();
  });

  it('updates the story start date and time', async () => {
    const updatedStory = cloneStory();
    updatedStory.startDateTime = '2026-07-27T09:30';
    vi.mocked(api.updateStory).mockResolvedValue(updatedStory);

    await renderEditor();

    const start = screen.getByLabelText('Story start date and time');
    fireEvent.change(start, { target: { value: '2026-07-27T09:30' } });
    fireEvent.blur(start);

    expect(api.updateStory).toHaveBeenCalledWith('story-1', {
      startDateTime: '2026-07-27T09:30',
    });
    expect(await screen.findByDisplayValue('2026-07-27T09:30')).toBeInTheDocument();
  });

  it('creates and edits a location from the location panel', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createLocation).mockResolvedValue({
      location: { id: 'location-1', name: 'New location', description: '' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateLocation)
      .mockResolvedValueOnce({
        location: { id: 'location-1', name: 'Harbor', description: '' },
        revision: 3,
        updatedAt: baseStory.updatedAt,
      })
      .mockResolvedValueOnce({
        location: { id: 'location-1', name: 'Harbor', description: 'A quiet harbor.' },
        revision: 4,
        updatedAt: baseStory.updatedAt,
      });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add location' }));

    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { name: 'Items' })).toBeInTheDocument();
    const name = within(inspector).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Harbor');
    fireEvent.blur(name);
    const category = within(inspector).getByLabelText('Category');
    await user.type(category, 'Coastal places');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateLocation).toHaveBeenCalledWith('story-1', 'location-1', {
        category: 'Coastal places',
      }),
    );
    const description = within(inspector).getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'A quiet harbor.');
    fireEvent.blur(description);

    await waitFor(() =>
      expect(api.updateLocation).toHaveBeenLastCalledWith('story-1', 'location-1', {
        description: 'A quiet harbor.',
      }),
    );
    expect(screen.getByRole('button', { name: 'Harbor' })).toBeInTheDocument();
  });

  it('assigns locations to interactions and trigger conditions', async () => {
    const user = userEvent.setup();
    const locatedStory = cloneStory();
    locatedStory.locations = [{ id: 'location-1', name: 'Harbor', description: '' }];
    const assignedStory = cloneStory(locatedStory);
    assignedStory.interactions[0].locationId = 'location-1';
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(assignedStory, 'interaction-1'),
    );
    const conditionedStory = cloneStory(assignedStory);
    conditionedStory.interactions[0].triggers[0].conditions = [
      { locationId: 'location-1', isCurrentLocation: true },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(conditionedStory, 'interaction-1', 'trigger-1'),
    );

    await renderEditor(locatedStory);
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.selectOptions(screen.getByLabelText('Location'), 'location-1');
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      locationId: 'location-1',
    });

    await user.click(screen.getByRole('button', { name: 'Select root trigger' }));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Location');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ locationId: 'location-1', isCurrentLocation: true }],
    });
  });

  it('creates, edits, assigns, and conditions a character', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'New character', description: '' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'Mira', description: '' },
      revision: 3,
      updatedAt: baseStory.updatedAt,
    });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add character' }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    const name = within(inspector).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Mira');
    fireEvent.blur(name);
    const category = within(inspector).getByLabelText('Category');
    await user.type(category, 'Allies');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateCharacter).toHaveBeenCalledWith('story-1', 'character-1', {
        category: 'Allies',
      }),
    );
    const description = within(inspector).getByLabelText('Description');
    await user.type(description, 'An investigator.');
    fireEvent.blur(description);
    await waitFor(() =>
      expect(api.updateCharacter).toHaveBeenCalledWith('story-1', 'character-1', {
        description: 'An investigator.',
      }),
    );
    expect(await screen.findByRole('button', { name: 'Mira' })).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    const assignedStory = cloneStory();
    assignedStory.characters = [{ id: 'character-1', name: 'Mira', description: '' }];
    assignedStory.interactions[0].characterIds = ['character-1'];
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(assignedStory, 'interaction-1'),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Mira' }));
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      characterIds: ['character-1'],
    });

    const conditionedStory = cloneStory(assignedStory);
    conditionedStory.interactions[0].triggers[0].conditions = [
      { characterId: 'character-1', isPresent: true },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(conditionedStory, 'interaction-1', 'trigger-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Select root trigger' }));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Character');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ characterId: 'character-1', isPresent: true }],
    });
    await user.selectOptions(screen.getByLabelText('Character condition operator'), 'absent');
    expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ characterId: 'character-1', isPresent: false }],
    });
  });

  it('creates a character stat and configures interaction effects and trigger comparisons', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createStatDefinition).mockResolvedValue({
      statDefinition: {
        id: 'definition-1',
        name: 'Trust',
        valueType: 'number',
      },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'Mira', description: '', stats: [] },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacterStat).mockResolvedValue({
      characterId: 'character-1',
      stat: { id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 0 },
      revision: 4,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateCharacterStat).mockResolvedValue({
      characterId: 'character-1',
      stat: { id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 2 },
      revision: 5,
      updatedAt: baseStory.updatedAt,
    });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    await user.type(screen.getByLabelText('Name'), 'Trust');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(api.createStatDefinition).toHaveBeenCalledWith('story-1', {
      name: 'Trust',
      valueType: 'number',
    });
    const category = screen.getByLabelText('Category');
    await user.type(category, 'Relationships');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateStatDefinition).toHaveBeenCalledWith('story-1', 'definition-1', {
        category: 'Relationships',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add character' }));
    await user.click(screen.getByRole('button', { name: 'Add stat' }));
    expect(api.createCharacterStat).toHaveBeenCalledWith('story-1', 'character-1', {
      statDefinitionId: 'definition-1',
      initialValue: 0,
    });
    const initialValue = screen.getByLabelText('Initial value');
    await user.clear(initialValue);
    await user.type(initialValue, '2');
    fireEvent.blur(initialValue);
    expect(api.updateCharacterStat).toHaveBeenCalledWith('story-1', 'character-1', 'stat-1', {
      initialValue: 2,
    });

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    const withEffect = cloneStory();
    withEffect.characters = [
      {
        id: 'character-1',
        name: 'Mira',
        description: '',
        stats: [{ id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 0 }],
      },
    ];
    withEffect.statDefinitions = [{ id: 'definition-1', name: 'Trust' }];
    withEffect.interactions[0].statEffects = [{ statId: 'stat-1', operation: 'add', value: 1 }];
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(withEffect, 'interaction-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Add effect' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Effect type' })).getByRole('button', {
        name: 'Variable',
      }),
    );
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      statEffects: [{ statId: 'stat-1', operation: 'add', value: 1 }],
    });
    await user.selectOptions(screen.getByLabelText('Variable effect operation'), 'set');
    const effectValue = screen.getByLabelText('Variable effect value');
    await user.clear(effectValue);
    await user.type(effectValue, '4');
    fireEvent.blur(effectValue);
    await user.click(screen.getByRole('button', { name: 'Delete variable effect' }));

    const conditioned = cloneStory(withEffect);
    conditioned.interactions[0].triggers[0].conditions = [
      { statId: 'stat-1', operator: 'gte', value: 2 },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(conditioned, 'interaction-1', 'trigger-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Select root trigger' }));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Variable');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ statId: 'stat-1', operator: 'gte', value: 2 }],
    });
    await user.selectOptions(screen.getByLabelText('Variable condition operator'), 'lt');
    const comparisonValue = screen.getByLabelText('Variable condition value');
    await user.clear(comparisonValue);
    await user.type(comparisonValue, '5');
    await user.click(screen.getByRole('button', { name: 'x' }));
  }, 30_000);

  it('creates an item definition and gives separate copies to a character', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createItemDefinition).mockResolvedValue({
      itemDefinition: { id: 'item-definition-1', name: 'Key', description: 'A brass key.' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateItemDefinition).mockResolvedValue({
      itemDefinition: {
        id: 'item-definition-1',
        name: 'Archive key',
        description: 'A brass key.',
      },
      revision: 3,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'Mira', description: '', items: [] },
      revision: 4,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacterItem)
      .mockResolvedValueOnce({
        characterId: 'character-1',
        item: { id: 'item-1', itemDefinitionId: 'item-definition-1' },
        revision: 5,
        updatedAt: baseStory.updatedAt,
      })
      .mockResolvedValueOnce({
        characterId: 'character-1',
        item: { id: 'item-2', itemDefinitionId: 'item-definition-1' },
        revision: 6,
        updatedAt: baseStory.updatedAt,
      });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add item definition' }));
    const itemName = screen.getByLabelText('Name');
    await user.clear(itemName);
    await user.type(itemName, 'Archive key');
    fireEvent.blur(itemName);
    expect(api.updateItemDefinition).toHaveBeenCalledWith('story-1', 'item-definition-1', {
      name: 'Archive key',
    });
    const category = screen.getByLabelText('Category');
    await user.type(category, 'Quest items');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateItemDefinition).toHaveBeenCalledWith('story-1', 'item-definition-1', {
        category: 'Quest items',
      }),
    );
    const itemDescription = screen.getByLabelText('Description');
    await user.clear(itemDescription);
    await user.type(itemDescription, 'Opens the archive.');
    fireEvent.blur(itemDescription);
    expect(api.updateItemDefinition).toHaveBeenLastCalledWith('story-1', 'item-definition-1', {
      description: 'Opens the archive.',
    });

    await user.click(screen.getByRole('button', { name: 'Add character' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(api.createCharacterItem).toHaveBeenCalledTimes(2);
    expect(api.createCharacterItem).toHaveBeenNthCalledWith(1, 'story-1', 'character-1', {
      itemDefinitionId: 'item-definition-1',
    });
    expect(api.createCharacterItem).toHaveBeenNthCalledWith(2, 'story-1', 'character-1', {
      itemDefinitionId: 'item-definition-1',
    });
    expect(
      within(screen.getByRole('complementary', { name: 'Inspector' })).getAllByText('Archive key', {
        selector: 'strong',
      }),
    ).toHaveLength(2);
  }, 30_000);

  it('collapses each story context section and the whole navigation', async () => {
    const user = userEvent.setup();
    await renderEditor();

    for (const section of ['Locations', 'Characters', 'Variables', 'Items']) {
      const toggle = screen.getByRole('button', { name: new RegExp(section) });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }

    await user.click(screen.getByRole('button', { name: 'Collapse story context' }));
    expect(screen.getByRole('button', { name: 'Expand story context' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand story context' }));
    expect(screen.getByRole('button', { name: 'Collapse story context' })).toBeInTheDocument();
  });

  it('opens the variable creator from the same context header pattern as other entities', async () => {
    const user = userEvent.setup();
    await renderEditor();

    const variablesToggle = screen.getByRole('button', { name: /Variables/ });
    const addVariable = screen.getByRole('button', { name: 'Add variable' });
    const variablesChevron = variablesToggle.querySelector('.context-heading-label > span');
    expect(addVariable.closest('.location-panel-header')).toContainElement(variablesToggle);
    expect(variablesChevron).toHaveTextContent('▾');

    await user.click(variablesToggle);
    expect(variablesToggle).toHaveAttribute('aria-expanded', 'false');
    expect(variablesChevron).toHaveTextContent('▸');
    await user.click(addVariable);

    expect(variablesToggle).toHaveAttribute('aria-expanded', 'true');
    expect(variablesChevron).toHaveTextContent('▾');
    expect(
      within(screen.getByRole('complementary', { name: 'Inspector' })).getByLabelText('Name'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Story context' })).queryByLabelText('Name'),
    ).not.toBeInTheDocument();
  });

  it('selects a variable from the context list and edits it in the inspector', async () => {
    const user = userEvent.setup();
    const story = cloneStory();
    story.statDefinitions = [{ id: 'attribute-definition-1', name: 'Energy', valueType: 'number' }];
    await renderEditor(story);

    const variableRow = screen.getByRole('button', { name: 'Energy' });
    await user.click(variableRow);

    expect(variableRow).toHaveClass('selected');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { name: 'Variable' })).toBeInTheDocument();
    expect(within(inspector).getByLabelText('Variable name')).toHaveValue('Energy');
  });

  it('remembers the collapsed story context navigation across editor mounts', async () => {
    const user = userEvent.setup();
    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Collapse story context' }));
    await waitFor(() => {
      expect(window.localStorage.getItem('paralleax-story-context-panel')).toBe('collapsed');
    });

    cleanup();
    await renderEditor();

    expect(screen.getByRole('button', { name: 'Expand story context' })).toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: 'Search story context and interactions' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand story context' }));
    await waitFor(() => {
      expect(window.localStorage.getItem('paralleax-story-context-panel')).toBe('open');
    });
  });

  it('summarizes real story references in compact context entity rows', async () => {
    const story = cloneStory();
    story.locations = [
      {
        id: 'harbor',
        name: 'Harbor',
        description: '',
        category: 'Coast',
        items: [{ id: 'harbor-key', itemDefinitionId: 'key' }],
      },
      { id: 'crossroads', name: 'Crossroads', description: '' },
    ];
    story.statDefinitions = [{ id: 'trust', name: 'Trust', category: 'Relationships' }];
    story.itemDefinitions = [
      { id: 'key', name: 'Archive key', description: '', category: 'Quest items' },
    ];
    story.characters = [
      {
        id: 'mira',
        name: 'Mira Vale',
        description: '',
        category: 'Allies',
        isPlayable: true,
        stats: [{ id: 'mira-trust', statDefinitionId: 'trust', initialValue: 3 }],
        items: [{ id: 'mira-key', itemDefinitionId: 'key' }],
      },
    ];
    story.interactions[0].locationId = 'harbor';
    story.interactions[0].characterIds = ['mira'];

    await renderEditor(story);

    const context = screen.getByRole('navigation', { name: 'Story context' });
    for (const category of ['Coast', 'Allies', 'Relationships', 'Quest items', 'Uncategorized']) {
      expect(within(context).getByText(category)).toBeInTheDocument();
    }
    expect(
      within(within(context).getByRole('button', { name: 'Harbor' })).getByText('1 interaction'),
    ).toBeInTheDocument();
    expect(
      within(within(context).getByRole('button', { name: 'Mira Vale' })).getByText(
        'Playable · 1 interaction',
      ),
    ).toBeInTheDocument();
    expect(within(context).getByRole('button', { name: 'Trust' })).toHaveTextContent(
      '1 assignment',
    );
    expect(
      within(within(context).getByRole('button', { name: 'Archive key' })).getByText('2 instances'),
    ).toBeInTheDocument();

    const interactionCard = within(screen.getByTestId('flow-node-interaction-1')).getByTestId(
      'interaction-node',
    );
    expect(within(interactionCard).getByText('Harbor')).toBeInTheDocument();
    expect(
      within(interactionCard).getByLabelText('Characters present: Mira Vale'),
    ).toBeInTheDocument();
  });

  it('filters context lists, counts text matches, navigates occurrences, and allows deeper zoom', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.locations = [
      { id: 'original-hall', name: 'Original Hall', description: '' },
      { id: 'harbor', name: 'Harbor', description: '', category: 'Coastal places' },
    ];
    story.characters = [
      { id: 'original-guide', name: 'Original Guide', description: '' },
      { id: 'mira', name: 'Mira', description: '' },
    ];

    await renderEditor(story);
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-min-zoom', '0.05');

    const search = screen.getByRole('searchbox', {
      name: 'Search story context and interactions',
    });
    await user.type(search, 'Original');

    expect(screen.getByRole('button', { name: 'Original Hall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Harbor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Original Guide' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mira' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('2 occurrences')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next interaction occurrence' }));
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Coastal');
    expect(screen.getByRole('button', { name: 'Harbor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Original Hall' })).not.toBeInTheDocument();
  });

  it('dims unrelated interactions and navigates references for a selected context entity', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.locations = [
      { id: 'harbor', name: 'Harbor', description: '' },
      { id: 'library', name: 'Library', description: '' },
    ];
    story.interactions[0].locationId = 'harbor';

    await renderEditor(story);
    await user.click(screen.getByRole('button', { name: 'Harbor' }));

    expect(
      within(screen.getByTestId('flow-node-interaction-1')).getByTestId('interaction-node'),
    ).not.toHaveClass('dimmed');
    expect(
      within(screen.getByTestId('flow-node-interaction-2')).getByTestId('interaction-node'),
    ).toHaveClass('dimmed');
    expect(screen.getByText('0 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next interaction occurrence' }));
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Harbor' })).toHaveClass('selected');
  });
});
