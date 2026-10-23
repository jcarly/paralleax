import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectorCommentField, InspectorCommentSlot } from './InspectorCommentField';

describe('InspectorCommentField', () => {
  afterEach(cleanup);

  it('opens the anchored discussions for the marked field', () => {
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

    const field = screen.getByText('Title').closest('.inspector-commentable-field')!;
    fireEvent.mouseEnter(field);
    const badge = screen.getByRole('button', { name: 'Open comments for Title' });
    fireEvent.mouseLeave(field, { relatedTarget: badge });
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);

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

  it('starts or opens a stable semantic field discussion from the same control', () => {
    const onOpenSemanticComments = vi.fn();

    render(
      <InspectorCommentSlot
        slot={{ kind: 'field', field: 'duration' }}
        label="Duration"
        semanticCommentCounts={{ 'field:duration': 2 }}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <label>
          Duration
          <input />
        </label>
      </InspectorCommentSlot>,
    );

    const field = screen.getByText('Duration').closest('.inspector-commentable-field')!;
    fireEvent.focus(field.querySelector('input')!);
    const badge = screen.getByRole('button', { name: 'Open comments for Duration' });
    fireEvent.blur(screen.getByRole('textbox'), { relatedTarget: badge });
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);

    expect(onOpenSemanticComments).toHaveBeenCalledWith({ kind: 'field', field: 'duration' });
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
