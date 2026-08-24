import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { TriggerInspector } from './TriggerInspector';

afterEach(cleanup);

function storyWithConditions(
  conditions: Story['interactions'][number]['triggers'][number]['conditions'],
) {
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
      onCreateTriggerVariant={vi.fn()}
      onDeleteTriggerGroup={vi.fn()}
      onDeleteTrigger={vi.fn()}
      onDeleteTriggerVariants={vi.fn()}
    />,
  );
  return onSaveTrigger;
}

describe('TriggerInspector temporal conditions', () => {
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

    expect(onSaveTrigger).toHaveBeenLastCalledWith(
      'interaction-1',
      'trigger-1',
      [],
      [{ statId: 'open', operator: 'eq', value: false }],
    );
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

    expect(onSaveTrigger).toHaveBeenLastCalledWith(
      'interaction-1',
      'trigger-1',
      [],
      [{ itemDefinitionId: 'key', isOwned: true }],
    );
  });

  it('adds a date and time condition', async () => {
    const onSaveTrigger = renderInspector(storyWithConditions([]));

    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Condition type' })).getByRole('button', {
        name: 'Date and time',
      }),
    );

    expect(onSaveTrigger).toHaveBeenCalledWith(
      'interaction-1',
      'trigger-1',
      [],
      [{ temporal: { weekdays: ['monday'] } }],
    );
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
    const story = storyWithConditions([
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

    await userEvent.click(screen.getByLabelText('Tue'));
    expect(onSaveTrigger).toHaveBeenLastCalledWith(
      'interaction-1',
      'trigger-1',
      [],
      expect.arrayContaining([
        expect.objectContaining({
          temporal: expect.objectContaining({ weekdays: ['monday', 'tuesday'] }),
        }),
      ]),
    );

    fireEvent.change(screen.getByLabelText('Allowed date 1'), {
      target: { value: '2026-08-16' },
    });
    expect(onSaveTrigger).toHaveBeenLastCalledWith(
      'interaction-1',
      'trigger-1',
      [],
      expect.arrayContaining([
        expect.objectContaining({
          temporal: expect.objectContaining({ dates: ['2026-08-16'] }),
        }),
      ]),
    );

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
});
