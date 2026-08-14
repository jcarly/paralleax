import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryCommentThread } from '@paralleax/shared';
import { StoryCommentsPanel } from './StoryCommentsPanel';

const thread: StoryCommentThread = {
  id: 'thread-1',
  storyId: 'story-1',
  anchor: { kind: 'entity', targetType: 'interaction', targetId: 'interaction-1' },
  anchorLabel: 'Arrival',
  status: 'open',
  createdBy: { id: 'user-1', email: 'author@example.com' },
  createdAt: '2026-08-13T09:00:00.000Z',
  updatedAt: '2026-08-13T09:00:00.000Z',
  messages: [
    {
      id: 'message-1',
      threadId: 'thread-1',
      author: { id: 'user-1', email: 'author@example.com' },
      body: 'Could this be clearer?',
      createdAt: '2026-08-13T09:00:00.000Z',
    },
  ],
};

describe('StoryCommentsPanel', () => {
  afterEach(cleanup);

  it('creates a thread for a draft canvas post-it', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(thread);
    render(
      <StoryCommentsPanel
        open
        loading={false}
        error=""
        threads={[]}
        draftAnchor={{ kind: 'canvas', position: { x: 12, y: 24 } }}
        canComment
        realtimeStatus="live"
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onCancelDraft={vi.fn()}
        onCreate={onCreate}
        onReply={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Live');
    await user.type(screen.getByRole('textbox'), 'Move this closer to the opening.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(onCreate).toHaveBeenCalledWith('Move this closer to the opening.');
  });

  it('shows a discussion and resolves it', async () => {
    const user = userEvent.setup();
    const onStatus = vi.fn().mockResolvedValue({ ...thread, status: 'resolved' });
    render(
      <StoryCommentsPanel
        open
        loading={false}
        error=""
        threads={[thread]}
        selectedThread={thread}
        canComment
        canManageThread
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onCancelDraft={vi.fn()}
        onCreate={vi.fn()}
        onReply={vi.fn()}
        onStatus={onStatus}
      />,
    );

    expect(screen.getByText('Could this be clearer?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onStatus).toHaveBeenCalledWith('thread-1', 'resolved');
  });

  it('offers reattachment for a detached thread', async () => {
    const user = userEvent.setup();
    const onReattach = vi.fn().mockResolvedValue(thread);
    render(
      <StoryCommentsPanel
        open
        loading={false}
        error=""
        threads={[thread]}
        selectedThread={{ ...thread, detached: true }}
        canComment
        canManageThread
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onCancelDraft={vi.fn()}
        onCreate={vi.fn()}
        onReply={vi.fn()}
        onStatus={vi.fn()}
        onReattach={onReattach}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reattach here' }));
    expect(onReattach).toHaveBeenCalledWith('thread-1');
  });
});
