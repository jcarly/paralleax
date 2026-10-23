import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story, TriggerCondition } from '@paralleax/shared';
import { TriggerInspector } from './TriggerInspector';

afterEach(cleanup);

function storyWithConditions(conditions: TriggerCondition[]): Story {
  return {
    id: 'story-1',
    title: 'Timed story',
    startDateTime: '2026-07-27T09:30',
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    interactions: [
      {
        id: 'interaction-1',
        title: 'Start',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions }],
      },
    ],
  } satisfies Story;
}

function renderInspector(story: Story, onSaveTrigger = vi.fn().mockResolvedValue(undefined)) {
  const interaction = story.interactions[0];
  render(
    <TriggerInspector
      story={story}
      interaction={interaction}
      trigger={interaction.triggers[0]}
      onSaveTrigger={onSaveTrigger}
      onDeleteTrigger={vi.fn()}
    />,
  );
  return onSaveTrigger;
}

function openConditionEditor(indexOrText: number | string = 0) {
  const summary =
    typeof indexOrText === 'number'
      ? screen.getAllByTestId('condition-summary')[indexOrText]
      : screen
          .getAllByTestId('condition-summary')
          .find((candidate) => candidate.textContent?.includes(indexOrText));
  expect(summary).toBeDefined();
  fireEvent.click(summary!);
}

describe('TriggerInspector temporal conditions', () => {
  it('shows concise condition rules and opens their controls on click', () => {
    const story = storyWithConditions([
      { interactionId: 'source-1', hasBeenVisited: true },
      { statId: 'score', operator: 'gte', value: 3 },
    ]);
    story.interactions[0].triggers[0].conditionGroups = [
      { id: 'first', conditions: story.interactions[0].triggers[0].conditions ?? [] },
      { id: 'second', conditions: [{ itemDefinitionId: 'key', isOwned: true }] },
    ];
    story.interactions.push({
      id: 'source-1',
      title: 'First source',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [],
    });
    story.statDefinitions = [{ id: 'score-definition', name: 'Score', valueType: 'number' }];
    story.stats = [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 0 }];
    story.itemDefinitions = [{ id: 'key', name: 'Key', description: '' }];

    renderInspector(story);

    expect(screen.getAllByTestId('condition-summary')[0]).toHaveTextContent(
      '"First source" has been visited',
    );
    expect(screen.queryByLabelText('Condition interaction')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('AND')).toHaveLength(1);
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.getAllByTestId('condition-summary')).toHaveLength(3);

    fireEvent.click(screen.getAllByTestId('condition-summary')[0]);

    const interaction = screen.getByLabelText('Condition interaction');
    expect(interaction).toBeInTheDocument();
    expect(screen.getAllByTestId('condition-summary')).toHaveLength(2);
    fireEvent.keyUp(screen.getByLabelText('Condition interaction'), { key: 'Enter' });
    expect(screen.queryByLabelText('Condition interaction')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('condition-summary')).toHaveLength(3);
  });

  it('saves an expression comparison only after a valid draft loses focus', () => {
    const story = storyWithConditions([
      { statId: 'score', operator: 'gte', expression: '@{score}' },
    ]);
    story.statDefinitions = [{ id: 'number', name: 'Score', valueType: 'number' }];
    story.stats = [{ id: 'score', statDefinitionId: 'number', initialValue: 2 }];
    const onSave = renderInspector(story);
    openConditionEditor();
    const field = screen.getByLabelText('Variable effect expression');
    fireEvent.change(field, { target: { value: '@{score} +' } });
    fireEvent.blur(field, { relatedTarget: screen.getByLabelText('Comparison value type') });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '@{score} + 2' } });
    fireEvent.blur(field, { relatedTarget: screen.getByLabelText('Comparison value type') });
    expect(onSave).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        {
          id: 'trigger-1',
          conditions: [{ statId: 'score', operator: 'gte', expression: '@{score} + 2' }],
        },
      ],
    });
    fireEvent.change(screen.getByLabelText('Comparison value type'), {
      target: { value: 'literal' },
    });
    expect(onSave).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        { id: 'trigger-1', conditions: [{ statId: 'score', operator: 'gte', value: 2 }] },
      ],
    });
    fireEvent.change(screen.getByLabelText('Comparison value type'), {
      target: { value: 'expression' },
    });
    expect(onSave).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        {
          id: 'trigger-1',
          conditions: [{ statId: 'score', operator: 'gte', expression: '@{score}' }],
        },
      ],
    });
  });
  it('moves Trigger explanations into labeled help tooltips', () => {
    renderInspector(storyWithConditions([]));

    expect(screen.getByText('Always matches')).toBeInTheDocument();
    const conditionsHelp = screen.getByRole('button', { name: '? — Path conditions' });
    const probabilityHelp = screen.getByRole('button', { name: '? — Appearance probability' });
    const timerHelp = screen.getByRole('button', { name: '? — Availability timer' });

    expect(conditionsHelp).toHaveTextContent('?');
    expect(conditionsHelp).toHaveAccessibleDescription(
      'Groups are alternatives (OR); conditions inside a group must all match (AND).',
    );
    expect(probabilityHelp).toHaveTextContent('?');
    expect(probabilityHelp).toHaveAccessibleDescription(
      'One deterministic roll is made for this Trigger at each step.',
    );
    expect(timerHelp).toHaveTextContent('?');
    expect(timerHelp).toHaveAccessibleDescription(
      'Leave empty for no timer. Zero seconds keeps the option hidden.',
    );
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips).toHaveLength(3);
    expect(tooltips[0].parentElement).toBe(document.body);
  });

  it('sets and clears the Trigger availability timer', () => {
    const story = storyWithConditions([]);
    const onSaveTrigger = renderInspector(story);
    const timer = screen.getByRole('spinbutton', { name: 'Availability timer' });

    fireEvent.change(timer, { target: { value: '8' } });
    fireEvent.blur(timer);
    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      timerSeconds: 8,
    });

    cleanup();
    story.interactions[0].triggers[0].timerSeconds = 8;
    const onClearTimer = renderInspector(story);
    const savedTimer = screen.getByRole('spinbutton', { name: 'Availability timer' });
    fireEvent.change(savedTimer, { target: { value: '' } });
    fireEvent.blur(savedTimer);
    expect(onClearTimer).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      timerSeconds: null,
    });
  });

  it('adds a typed variable condition', async () => {
    const story: Story = storyWithConditions([]);
    story.statDefinitions = [{ id: 'open-definition', name: 'Open', valueType: 'boolean' }];
    story.stats = [{ id: 'open', statDefinitionId: 'open-definition', initialValue: false }];
    const onSaveTrigger = renderInspector(story);

    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Condition type' })).getByRole('button', {
        name: 'Variable',
      }),
    );

    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        { id: 'trigger-1', conditions: [{ statId: 'open', operator: 'eq', value: false }] },
      ],
    });
  });

  it('uses the shared variable picker for variable conditions', async () => {
    const story: Story = storyWithConditions([{ statId: 'open', operator: 'eq', value: false }]);
    story.statDefinitions = [{ id: 'open-definition', name: 'Open', valueType: 'boolean' }];
    story.stats = [{ id: 'open', statDefinitionId: 'open-definition', initialValue: false }];
    renderInspector(story);
    openConditionEditor();

    expect(screen.getByLabelText('Variable owner')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'World -> Timed story' })).toBeInTheDocument();
  });

  it('compares a variable condition with another compatible variable', () => {
    const story: Story = storyWithConditions([{ statId: 'courage', operator: 'gte', value: 1 }]);
    story.statDefinitions = [{ id: 'number-definition', name: 'Number', valueType: 'number' }];
    story.stats = [
      { id: 'courage', statDefinitionId: 'number-definition', initialValue: 1 },
      { id: 'fear', statDefinitionId: 'number-definition', initialValue: 2 },
    ];
    const onSaveTrigger = renderInspector(story);

    openConditionEditor();
    fireEvent.change(screen.getByLabelText('Comparison value type'), { target: { value: 'stat' } });

    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        {
          id: 'trigger-1',
          conditions: [{ statId: 'courage', operator: 'gte', comparisonStatId: 'fear' }],
        },
      ],
    });
  });

  it('adds an item ownership condition', async () => {
    const story: Story = storyWithConditions([]);
    story.itemDefinitions = [
      { id: 'key', name: 'Key', description: '' },
      { id: 'map', name: 'Map', description: '' },
    ];
    const onSaveTrigger = renderInspector(story);

    expect(screen.getAllByRole('button', { name: 'Add condition' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    const picker = screen.getByRole('group', { name: 'Condition type' });
    expect(within(picker).getByText('Choose a condition type')).toBeInTheDocument();
    await userEvent.click(within(picker).getByRole('button', { name: 'Item' }));

    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        { id: 'trigger-1', conditions: [{ itemDefinitionId: 'key', isOwned: true }] },
      ],
    });
    expect(screen.queryByRole('group', { name: 'Condition type' })).not.toBeInTheDocument();
  });

  it('places group delete control over its card and keeps it out of its content flow', async () => {
    const story = storyWithConditions([]);
    story.interactions[0].triggers[0].conditionGroups = [
      { id: 'first', conditions: [] },
      { id: 'second', conditions: [] },
    ];
    renderInspector(story);

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete this OR group' });
    expect(deleteButtons).toHaveLength(2);
    expect(deleteButtons[0]).toHaveClass('trigger-variant-delete');
    expect(deleteButtons[0].parentElement).toHaveClass('trigger-variant-header');
  });

  it('adds a date and time condition', async () => {
    const onSaveTrigger = renderInspector(storyWithConditions([]));

    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Condition type' })).getByRole('button', {
        name: 'Date and time',
      }),
    );

    expect(onSaveTrigger).toHaveBeenCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [{ id: 'trigger-1', conditions: [{ temporal: { weekdays: ['monday'] } }] }],
    });
  });

  it('explains why condition types are unavailable', async () => {
    renderInspector(storyWithConditions([]));

    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    const picker = screen.getByRole('group', { name: 'Condition type' });
    const location = within(picker).getByRole('button', { name: 'Location' });
    const reason = 'Create a location before using this condition type.';

    expect(location).toBeDisabled();
    expect(location).toHaveAttribute('title', reason);
    expect(within(picker).getByText(reason)).toHaveAttribute('role', 'tooltip');
    expect(within(picker).getByRole('button', { name: 'Date and time' })).toBeEnabled();
  });

  it('edits multiple weekdays, dates, date ranges, and time slots', async () => {
    const story: Story = storyWithConditions([
      {
        temporal: {
          dates: ['2026-08-15'],
          dateRanges: [{ startDate: '2026-09-01', endDate: '2026-09-03' }],
          weekdays: ['monday'],
          timeSlots: [{ startTime: '09:00', endTime: '12:00' }],
        },
      },
    ]);
    const onSaveTrigger = renderInspector(story);

    openConditionEditor();
    await userEvent.click(screen.getByLabelText('Tue'));
    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        {
          id: 'trigger-1',
          conditions: expect.arrayContaining([
            expect.objectContaining({
              temporal: expect.objectContaining({ weekdays: ['monday', 'tuesday'] }),
            }),
          ]),
        },
      ],
    });

    fireEvent.change(screen.getByLabelText('Allowed date 1'), {
      target: { value: '2026-08-16' },
    });
    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        {
          id: 'trigger-1',
          conditions: expect.arrayContaining([
            expect.objectContaining({
              temporal: expect.objectContaining({ dates: ['2026-08-16'] }),
            }),
          ]),
        },
      ],
    });

    fireEvent.change(screen.getByLabelText('Date range 1 start'), {
      target: { value: '2026-09-02' },
    });
    fireEvent.change(screen.getByLabelText('Date range 1 end'), {
      target: { value: '2026-09-04' },
    });
    fireEvent.change(screen.getByLabelText('Time slot 1 start'), {
      target: { value: '10:00' },
    });
    fireEvent.change(screen.getByLabelText('Time slot 1 end'), {
      target: { value: '13:00' },
    });
    await userEvent.click(screen.getByLabelText('Delete allowed date 1'));
    await userEvent.click(screen.getByLabelText('Delete date range 1'));
    await userEvent.click(screen.getByLabelText('Delete time slot 1'));
    await userEvent.click(screen.getByRole('button', { name: 'Add date' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add date range' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add time slot' }));
    expect(onSaveTrigger).toHaveBeenCalledTimes(12);
  });

  it('edits interaction, location, character, item, and variable conditions', () => {
    const story: Story = storyWithConditions([
      { interactionId: 'source-1', hasBeenVisited: true },
      { locationId: 'location-1', isCurrentLocation: true },
      { characterId: 'character-1', isPresent: true },
      { itemDefinitionId: 'item-1', isOwned: true },
      { statId: 'score', operator: 'gte', value: 1 },
    ]);
    story.interactions.push(
      {
        id: 'source-1',
        title: 'First source',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [],
      },
      {
        id: 'source-2',
        title: 'Second source',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [],
      },
    );
    story.locations = [
      { id: 'location-1', name: 'Harbor', description: '' },
      { id: 'location-2', name: 'Station', description: '' },
    ];
    story.characters = [
      { id: 'character-1', name: 'Mira', description: '' },
      { id: 'character-2', name: 'Jon', description: '' },
    ];
    story.itemDefinitions = [
      { id: 'item-1', name: 'Key', description: '' },
      { id: 'item-2', name: 'Map', description: '' },
    ];
    story.statDefinitions = [
      { id: 'score-definition', name: 'Score', valueType: 'number' },
      { id: 'mood-definition', name: 'Mood', valueType: 'string' },
    ];
    story.stats = [
      { id: 'score', statDefinitionId: 'score-definition', initialValue: 1 },
      { id: 'mood', statDefinitionId: 'mood-definition', initialValue: 'calm' },
    ];
    const onSaveTrigger = renderInspector(story);

    openConditionEditor('First source');
    fireEvent.change(screen.getByLabelText('Condition interaction'), {
      target: { value: 'source-2' },
    });
    fireEvent.change(screen.getByLabelText('Interaction condition operator'), {
      target: { value: 'not-visited' },
    });
    openConditionEditor('Harbor');
    fireEvent.change(screen.getByLabelText('Condition location'), {
      target: { value: 'location-2' },
    });
    fireEvent.change(screen.getByLabelText('Location condition operator'), {
      target: { value: 'not-current' },
    });
    openConditionEditor('Mira');
    fireEvent.change(screen.getByLabelText('Condition character'), {
      target: { value: 'character-2' },
    });
    fireEvent.change(screen.getByLabelText('Character condition operator'), {
      target: { value: 'absent' },
    });
    openConditionEditor('Key');
    fireEvent.change(screen.getByLabelText('Condition item'), { target: { value: 'item-2' } });
    fireEvent.change(screen.getByLabelText('Item condition operator'), {
      target: { value: 'not-owned' },
    });
    openConditionEditor('Story -> Score');
    fireEvent.change(
      within(screen.getByLabelText('Condition variable')).getAllByRole('combobox')[1],
      { target: { value: 'variable:story:mood' } },
    );
    fireEvent.change(screen.getByLabelText('Variable condition operator'), {
      target: { value: 'neq' },
    });
    fireEvent.change(screen.getByLabelText('Variable condition value'), {
      target: { value: '7' },
    });

    expect(onSaveTrigger).toHaveBeenCalledTimes(11);
    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      conditionGroups: [
        {
          id: 'trigger-1',
          conditions: expect.arrayContaining([
            expect.objectContaining({ statId: 'score', operator: 'gte', value: 7 }),
          ]),
        },
      ],
    });
  });

  it('saves the Trigger appearance probability', () => {
    const onSaveTrigger = renderInspector(storyWithConditions([]));

    fireEvent.change(screen.getByLabelText('Appearance probability'), { target: { value: '35' } });
    fireEvent.blur(screen.getByLabelText('Appearance probability'));

    expect(onSaveTrigger).toHaveBeenLastCalledWith('interaction-1', 'trigger-1', {
      appearanceProbability: 35,
    });
  });
});
