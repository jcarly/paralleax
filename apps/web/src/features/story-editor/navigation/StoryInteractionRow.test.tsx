import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Interaction } from '@paralleax/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { StoryInteractionRow } from './StoryInteractionRow';

afterEach(cleanup);

function untitled(id: string, body: string): Interaction {
  return { id, title: '', body, position: { x: 0, y: 0 }, triggers: [] };
}

it('lists an untitled Interaction by its content, never by a generated name', () => {
  render(
    <StoryInteractionRow
      interaction={untitled('a-1111', '<p>You wake in a radio station</p>')}
      depth={0}
      selected={false}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'You wake in a radio station' })).toBeInTheDocument();
  expect(screen.queryByText(/New interaction|Start/)).not.toBeInTheDocument();
});

it('keeps an Interaction without title or content distinguishable and selectable', async () => {
  const onSelect = vi.fn();
  render(
    <>
      <StoryInteractionRow
        interaction={untitled('a-1111', '')}
        depth={0}
        selected
        onSelect={onSelect}
      />
      <StoryInteractionRow
        interaction={untitled('b-2222', '')}
        depth={0}
        selected={false}
        onSelect={vi.fn()}
      />
    </>,
  );
  const [first, second] = screen.getAllByRole('button');
  expect(first).toHaveTextContent('○ 1111');
  expect(second).toHaveTextContent('○ 2222');
  await userEvent.click(first);
  expect(onSelect).toHaveBeenCalledTimes(1);
});
