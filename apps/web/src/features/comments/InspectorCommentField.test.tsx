import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commentBadgeHideDelayMs, commentBadgeIntentDelayMs } from './commentBadgeOwner';
import { InspectorCommentField, InspectorCommentSlot } from './InspectorCommentField';

function parentOf(element: Element | null): HTMLElement {
  const parent = element?.parentElement;
  if (!parent) {
    throw new Error('Expected a parent element');
  }
  return parent;
}

function fieldOf(element: Element): HTMLElement {
  const field = element.closest<HTMLElement>('.inspector-commentable-field');
  if (!field) {
    throw new Error('Expected a commentable field');
  }
  return field;
}

describe('InspectorCommentField', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

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

    const field = fieldOf(screen.getByText('Title'));
    fireEvent.pointerOver(field);
    const badge = screen.getByRole('button', { name: 'Open comments for Title' });
    expect(field).toContainElement(badge);
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

    fireEvent.focus(screen.getByRole('textbox'));
    const badge = screen.getByRole('button', { name: 'Open comments for Duration' });
    fireEvent.blur(screen.getByRole('textbox'), { relatedTarget: badge });
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);

    expect(onOpenSemanticComments).toHaveBeenCalledWith({ kind: 'field', field: 'duration' });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  function renderContextRow(onOpen = vi.fn()) {
    render(
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'contextAndTiming' }}
        label="Context"
        onOpenSemanticComments={onOpen}
      >
        <InspectorCommentSlot
          slot={{ kind: 'field', field: 'location' }}
          label="Location"
          onOpenSemanticComments={onOpen}
        >
          <button type="button">Harbor</button>
        </InspectorCommentSlot>
        <InspectorCommentSlot
          slot={{ kind: 'field', field: 'characters' }}
          label="Characters"
          onOpenSemanticComments={onOpen}
        >
          <button type="button">Mira</button>
        </InspectorCommentSlot>
        <button type="button">Duration</button>
      </InspectorCommentSlot>,
    );
    return onOpen;
  }

  it('shows one badge, for the innermost field under the pointer', () => {
    renderContextRow();

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Harbor' }));

    expect(screen.getAllByRole('button', { name: /^Comment on/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Comment on Location' })).toBeInTheDocument();
  });

  it('keeps the badge while the pointer crosses another field on its way to it', () => {
    vi.useFakeTimers();
    const onOpen = renderContextRow();
    const location = parentOf(screen.getByRole('button', { name: 'Harbor' }));
    const context = parentOf(location);

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Mira' }));
    const badge = screen.getByRole('button', { name: 'Comment on Characters' });
    fireEvent.pointerLeave(parentOf(screen.getByRole('button', { name: 'Mira' })));
    fireEvent.pointerOver(location);
    fireEvent.pointerOver(context);
    act(() => {
      vi.advanceTimersByTime(commentBadgeIntentDelayMs / 2);
    });
    fireEvent.pointerOver(badge);
    act(() => {
      vi.advanceTimersByTime(commentBadgeHideDelayMs + commentBadgeIntentDelayMs);
    });

    expect(screen.getByRole('button', { name: 'Comment on Characters' })).toBe(badge);
    fireEvent.click(badge);
    expect(onOpen).toHaveBeenCalledWith({ kind: 'field', field: 'characters' });
  });

  it('switches to a field the pointer rests on, and hides after leaving', () => {
    vi.useFakeTimers();
    renderContextRow();
    const mira = screen.getByRole('button', { name: 'Mira' });

    fireEvent.pointerOver(screen.getByRole('button', { name: 'Harbor' }));
    fireEvent.pointerOver(mira);
    act(() => {
      vi.advanceTimersByTime(commentBadgeIntentDelayMs);
    });
    expect(screen.getByRole('button', { name: 'Comment on Characters' })).toBeInTheDocument();

    fireEvent.pointerLeave(parentOf(mira), { clientX: 400, clientY: 400 });
    act(() => {
      vi.advanceTimersByTime(commentBadgeHideDelayMs);
    });
    expect(screen.queryByRole('button', { name: /^Comment on/ })).not.toBeInTheDocument();
  });

  it('places the badge right after the focused field in the keyboard order', async () => {
    const user = userEvent.setup();
    const onOpen = renderContextRow();

    await user.click(screen.getByRole('button', { name: 'Harbor' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Comment on Location' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith({ kind: 'field', field: 'location' });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Mira' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Comment on Characters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Comment on Location' })).not.toBeInTheDocument();
  });
});
