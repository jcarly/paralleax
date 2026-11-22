import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, it, expect } from 'vitest';
import type { Story, TriggerCondition } from '@paralleax/shared';
import type { ConditionType } from '../triggerConditionAuthoring';
import { AddConditionControl, TriggerConditionFields } from './TriggerConditionEditor';

afterEach(cleanup);

const unavailableReasons: Record<ConditionType, string | undefined> = {
  interaction: '',
  location: 'No locations',
  character: undefined,
  stat: undefined,
  item: undefined,
  dateTime: undefined,
};

const story = {
  id: 'story-1',
  title: 'Story',
  startDateTime: '2026-07-27T09:30',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  interactions: [],
} satisfies Story;

function changeStatComparisonType(itemId: string) {
  const changes: TriggerCondition[] = [];
  render(
    <TriggerConditionFields
      condition={{ statId: 'score', itemId, operator: 'eq', value: 0 }}
      story={story}
      currentInteractionId="interaction-1"
      onChange={(condition) => changes.push(condition)}
    />,
  );
  fireEvent.change(screen.getByLabelText('Comparison value type'), {
    target: { value: 'expression' },
  });
  return changes;
}

it('keeps empty availability reasons available and nonempty reasons disabled', () => {
  render(
    <AddConditionControl
      initiallyOpen
      unavailableReasons={unavailableReasons}
      onAdd={() => undefined}
    />,
  );

  const interaction = screen.getByRole('button', { name: 'Interaction' });
  const location = screen.getByRole('button', { name: 'Location' });
  const character = screen.getByRole('button', { name: 'Character' });
  expect(interaction).toBeEnabled();
  expect(interaction).not.toHaveAttribute('aria-describedby');
  expect(character).toBeEnabled();
  expect(character).not.toHaveAttribute('aria-describedby');
  expect(location).toBeDisabled();
  expect(screen.getByRole('tooltip')).toHaveTextContent('No locations');
});

it('omits an empty item id when changing comparison type', () => {
  expect(changeStatComparisonType('')).toEqual([
    { statId: 'score', operator: 'eq', expression: '@{}' },
  ]);
});

it('preserves a nonempty item id when changing comparison type', () => {
  expect(changeStatComparisonType('item-1')).toEqual([
    { statId: 'score', itemId: 'item-1', operator: 'eq', expression: '@{}' },
  ]);
});
