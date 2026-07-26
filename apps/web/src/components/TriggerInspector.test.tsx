import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { TriggerInspector } from './TriggerInspector';

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
      onDeleteTrigger={vi.fn()}
      onDeleteTriggerVariants={vi.fn()}
    />,
  );
  return onSaveTrigger;
}

describe('TriggerInspector temporal conditions', () => {
  it('adds a date and time condition', async () => {
    const onSaveTrigger = renderInspector(storyWithConditions([]));

    await userEvent.click(screen.getByRole('button', { name: 'Add date/time condition' }));

    expect(onSaveTrigger).toHaveBeenCalledWith(
      'interaction-1',
      'trigger-1',
      [],
      [{ temporal: { weekdays: ['monday'] } }],
    );
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
