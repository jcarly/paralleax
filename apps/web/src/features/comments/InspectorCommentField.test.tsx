import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectorCommentField } from './InspectorCommentField';

describe('InspectorCommentField', () => {
  afterEach(cleanup);

  it('opens the anchored discussions for the marked field', async () => {
    const user = userEvent.setup();
    const onOpenTextComments = vi.fn();

    render(
      <InspectorCommentField
        field="title"
        label="Title"
        textCommentCounts={{ title: 2 }}
        onOpenTextComments={onOpenTextComments}
      >
        <label>
          Title
          <input data-comment-field="title" />
        </label>
      </InspectorCommentField>,
    );

    await user.click(screen.getByRole('button', { name: 'Open comments for Title' }));

    expect(onOpenTextComments).toHaveBeenCalledOnce();
    expect(onOpenTextComments).toHaveBeenCalledWith('title');
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not add a control to a field without an open discussion', () => {
    render(
      <InspectorCommentField field="description" label="Description">
        <p data-comment-field="description">No comment here.</p>
      </InspectorCommentField>,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
