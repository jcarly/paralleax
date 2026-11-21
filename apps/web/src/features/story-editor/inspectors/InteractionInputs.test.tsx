import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Interaction } from '@paralleax/shared';
import { InteractionInputs } from './InteractionInputs';

afterEach(cleanup);

function interaction(id: string, title: string, inputs: string[][]): Interaction {
  return {
    id,
    title,
    body: '',
    position: { x: 0, y: 0 },
    triggers: inputs.map((inputInteractionIds, index) => ({
      id: `${id}-trigger-${String(index)}`,
      inputInteractionIds,
    })),
  };
}

const gate = interaction('gate', 'Gate', [[]]);
const hall = interaction('hall', '', [['gate']]);
const throne = interaction('throne', 'Throne', [['gate'], ['hall']]);
const story = { interactions: [gate, hall, throne] };

describe('InteractionInputs', () => {
  it('lists every source once, in Story order, and selects one on click', async () => {
    const onSelectInteraction = vi.fn();
    render(
      <InteractionInputs
        story={story}
        interaction={throne}
        onSelectInteraction={onSelectInteraction}
      />,
    );

    const list = screen.getByRole('list', { name: 'Incoming interactions' });
    expect(list).toHaveTextContent('←GateUntitled');
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
    expect(onSelectInteraction).toHaveBeenCalledWith('hall');
  });

  it('marks a starting point and hides the row without inputs', () => {
    const { rerender } = render(<InteractionInputs story={story} interaction={gate} />);
    expect(screen.getByRole('list', { name: 'Incoming interactions' })).toHaveTextContent('Start');

    rerender(<InteractionInputs story={story} interaction={interaction('orphan', '', [])} />);
    expect(screen.queryByRole('list', { name: 'Incoming interactions' })).not.toBeInTheDocument();
  });
});
