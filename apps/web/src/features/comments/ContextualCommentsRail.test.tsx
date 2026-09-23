import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryCommentThread } from '@paralleax/shared';
import { ContextualCommentsRail } from './ContextualCommentsRail';

const thread: StoryCommentThread = {
  id: 'thread-1',
  storyId: 'story-1',
  anchor: { kind: 'entity', targetType: 'interaction', targetId: 'interaction-1' },
  anchorLabel: 'Arrival',
  status: 'open',
  createdBy: { id: 'user-1', displayName: 'Author' },
  createdAt: '2026-08-13T09:00:00.000Z',
  updatedAt: '2026-08-13T09:00:00.000Z',
  messages: [
    {
      id: 'message-1',
      threadId: 'thread-1',
      author: { id: 'user-1', displayName: 'Author' },
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
          author: { id: 'user-2', displayName: 'Reviewer' },
          body: 'Yes, let us shorten it.',
          createdAt: '2026-08-13T10:00:00.000Z',
        },
      ],
    });
    const onStatus = vi.fn().mockResolvedValue({ ...thread, status: 'resolved' });
    const onDelete = vi.fn();

    render(
      <ContextualCommentsRail
        threads={[thread]}
        selectedThreadId={thread.id}
        error=""
        canComment
        canManageThread={() => true}
        canDeleteThread={() => true}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onCancelDraft={vi.fn()}
        onReply={onReply}
        onStatus={onStatus}
        onDelete={onDelete}
        onClose={vi.fn()}
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

    await user.click(screen.getByRole('button', { name: 'Delete discussion' }));
    expect(onDelete).toHaveBeenCalledWith(thread.id);
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
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Check this scene.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onCreate).toHaveBeenCalledWith('Check this scene.');
  });

  it('keeps every discussion visible and opens the reply field only for the active one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const second = {
      ...thread,
      id: 'thread-2',
      anchorLabel: 'Departure',
      messages: [
        {
          ...thread.messages[0],
          id: 'message-2',
          threadId: 'thread-2',
          body: 'Check the final sentence.',
        },
      ],
    };

    render(
      <ContextualCommentsRail
        threads={[thread, second]}
        error=""
        canComment
        canManageThread={() => false}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onCancelDraft={vi.fn()}
        onReply={vi.fn()}
        onStatus={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Could this be clearer?')).toBeInTheDocument();
    expect(screen.getByText('Check the final sentence.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open comment: Departure' }));
    expect(onSelect).toHaveBeenCalledWith('thread-2');
  });

  it('hides only the reply field when focus leaves the active discussion', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(thread.id);
      return (
        <>
          <button type="button">Outside the discussion</button>
          <ContextualCommentsRail
            threads={[thread]}
            selectedThreadId={selectedThreadId}
            error=""
            canComment
            canManageThread={() => false}
            onSelect={setSelectedThreadId}
            onCreate={vi.fn()}
            onCancelDraft={vi.fn()}
            onReply={vi.fn()}
            onStatus={vi.fn()}
            onClose={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside the discussion' }));

    expect(screen.queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Comments for the selected element' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Could this be clearer?')).toBeInTheDocument();
  });
});
