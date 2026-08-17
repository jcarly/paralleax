import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryCommentThread } from '@paralleax/shared';
import { ContextualCommentsRail } from './ContextualCommentsRail';

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

describe('ContextualCommentsRail', () => {
  afterEach(cleanup);

  it('keeps a contextual discussion beside the inspector and replies inline', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn().mockResolvedValue({
      ...thread,
      messages: [
        ...thread.messages,
        {
          id: 'message-2',
          threadId: thread.id,
          author: { id: 'user-2', email: 'reviewer@example.com' },
          body: 'Yes, let us shorten it.',
          createdAt: '2026-08-13T10:00:00.000Z',
        },
      ],
    });
    const onStatus = vi.fn().mockResolvedValue({ ...thread, status: 'resolved' });

    render(
      <ContextualCommentsRail
        threads={[thread]}
        selectedThreadId={thread.id}
        error=""
        canComment
        canManageThread={() => true}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onCancelDraft={vi.fn()}
        onReply={onReply}
        onStatus={onStatus}
      />,
    );

    expect(
      screen.getByRole('complementary', { name: 'Comments for the selected element' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Could this be clearer?')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Yes, let us shorten it.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onReply).toHaveBeenCalledWith(thread.id, 'Yes, let us shorten it.');

    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onStatus).toHaveBeenCalledWith(thread.id, 'resolved');
  });

  it('shows a new contextual comment composer without opening the global list', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(thread);

    render(
      <ContextualCommentsRail
        threads={[]}
        draftAnchor={{ kind: 'entity', targetType: 'interaction', targetId: 'interaction-1' }}
        error=""
        canComment
        canManageThread={() => false}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onCancelDraft={vi.fn()}
        onReply={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Check this scene.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onCreate).toHaveBeenCalledWith('Check this scene.');
  });
});
