import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryHistory } from '@paralleax/shared';
import { StoryHistoryPanel } from './StoryHistoryPanel';

const history: StoryHistory = {
  entries: [
    {
      id: 'event-3',
      revision: 4,
      kind: 'undo',
      operation: 'interaction.created',
      actor: { id: 'user-1', email: 'alice@example.test' },
      createdAt: '2026-08-30T10:20:00.000Z',
      reverted: false,
    },
    {
      id: 'event-2',
      revision: 3,
      kind: 'change',
      operation: 'graph.positions.updated',
      actor: { id: 'user-2', email: 'bob@example.test' },
      createdAt: '2026-08-30T09:10:00.000Z',
      reverted: true,
    },
    {
      id: 'event-1',
      revision: 2,
      kind: 'change',
      operation: 'legacy.custom-operation',
      actor: { id: 'user-1' },
      createdAt: '2026-08-29T08:00:00.000Z',
      reverted: false,
    },
  ],
  canUndo: true,
  canRedo: false,
};

describe('StoryHistoryPanel', () => {
  afterEach(cleanup);

  it('shows readable grouped durable events and their authors', () => {
    render(
      <StoryHistoryPanel
        history={history}
        busy={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('complementary', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByText('Undid: Interaction created')).toBeInTheDocument();
    expect(screen.getByText('Graph layout updated')).toBeInTheDocument();
    expect(screen.getByText('Legacy custom operation')).toBeInTheDocument();
    expect(screen.getByText('alice@example.test')).toBeInTheDocument();
    expect(screen.getByText('Reverted')).toBeInTheDocument();
    expect(screen.getByText('Revision 4')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  it('reuses the global undo and redo actions', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <StoryHistoryPanel
        history={{ ...history, canRedo: true }}
        busy={false}
        onUndo={onUndo}
        onRedo={onRedo}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Redo' }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });
});
