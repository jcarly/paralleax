import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryCommentThread } from '@paralleax/shared';
import type { ComponentProps } from 'react';
import { CommentPinNode, type CommentPinNodeData } from './CommentPinNode';

const thread: StoryCommentThread = {
  id: 'thread-1',
  storyId: 'story-1',
  anchor: { kind: 'canvas', position: { x: 120, y: 180 } },
  anchorLabel: 'Story graph',
  status: 'open',
  createdBy: { id: 'user-1', email: 'author@example.com' },
  createdAt: '2026-08-13T09:00:00.000Z',
  updatedAt: '2026-08-13T09:00:00.000Z',
  messages: [
    {
      id: 'message-1',
      threadId: 'thread-1',
      author: { id: 'user-1', email: 'author@example.com' },
      body: 'Move this branch higher.',
      createdAt: '2026-08-13T09:00:00.000Z',
    },
  ],
};

function nodeData(overrides: Partial<CommentPinNodeData> = {}): CommentPinNodeData {
  return {
    thread,
    expanded: false,
    canComment: true,
    canManageThread: true,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onCancelDraft: vi.fn(),
    onReply: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  };
}

function renderNode(data: CommentPinNodeData) {
  const props = { id: `comment:${thread.id}`, data } as unknown as ComponentProps<
    typeof CommentPinNode
  >;
  render(<CommentPinNode {...props} />);
}

describe('CommentPinNode', () => {
  afterEach(cleanup);

  it('renders the canvas comment as a post-it and opens its discussion on click', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    renderNode(nodeData({ onOpen }));

    expect(screen.getByText('Move this branch higher.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open comment: Story graph' }));
    expect(onOpen).toHaveBeenCalledWith(thread.id);
  });

  it('offers an inline reply when the post-it is expanded', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn().mockResolvedValue(thread);

    renderNode(nodeData({ expanded: true, onReply }));

    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Done.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onReply).toHaveBeenCalledWith(thread.id, 'Done.');
  });

  it('creates a new canvas post-it directly on the graph', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(thread);

    renderNode(
      nodeData({
        thread: undefined,
        draftAnchor: { kind: 'canvas', position: { x: 120, y: 180 } },
        expanded: true,
        onCreate,
      }),
    );

    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'Move this branch.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onCreate).toHaveBeenCalledWith('Move this branch.');
  });
});
