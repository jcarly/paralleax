import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichTextContent } from './RichTextContent';
import { RichTextEditor } from './RichTextEditor';

describe('RichTextEditor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('edits rich HTML and offers image, GIF, and video insertion', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('https://media.example/scene.gif')
      .mockReturnValueOnce('https://www.youtube.com/watch?v=video-1');

    render(<RichTextEditor value="<p>Opening</p>" onChange={onChange} onBlur={onBlur} />);

    const editor = screen.getByRole('textbox', { name: 'Content' });
    expect(editor.innerHTML).toBe('<p>Opening</p>');
    editor.innerHTML = '<p><strong>Changed</strong></p>';
    fireEvent.input(editor);
    fireEvent.blur(editor);
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Changed</strong></p>');
    expect(onBlur).toHaveBeenLastCalledWith('<p><strong>Changed</strong></p>');

    for (const [label, commandName, commandValue] of [
      ['Bold', 'bold', undefined],
      ['Italic', 'italic', undefined],
      ['Underline', 'underline', undefined],
      ['Heading', 'formatBlock', 'h2'],
      ['Bulleted list', 'insertUnorderedList', undefined],
    ] as const) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(execCommand).toHaveBeenCalledWith(commandName, false, commandValue);
    }

    await user.click(screen.getByRole('button', { name: 'Add image or GIF' }));
    expect(execCommand).toHaveBeenCalledWith(
      'insertImage',
      false,
      'https://media.example/scene.gif',
    );

    await user.click(screen.getByRole('button', { name: 'Add video' }));
    expect(execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('https://www.youtube-nocookie.com/embed/video-1'),
    );
  });

  it('removes scripts, event handlers, and unsafe URLs when rendering', () => {
    const { container } = render(
      <RichTextContent
        html={
          '<p>Hello</p><img src="javascript:alert(1)" onerror="alert(1)">' +
          '<iframe src="https://evil.example/embed"></iframe><script>alert(1)</script>'
        }
      />,
    );

    expect(container).toHaveTextContent('Hello');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).not.toHaveAttribute('src');
    expect(container.querySelector('img')).not.toHaveAttribute('onerror');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('warns before the authored HTML limit and reports content over the limit', () => {
    const { container, rerender } = render(
      <RichTextEditor
        value="123456789012345678"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        maxLength={20}
      />,
    );

    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveTextContent(
      '2 characters remaining.',
    );
    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveClass(
      'warning',
    );

    rerender(
      <RichTextEditor
        value="123456789012345678901"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        maxLength={20}
      />,
    );
    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveTextContent(
      '1 character over limit. This content cannot be saved.',
    );
    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveClass('error');
  });

  it('inserts a conditional text frame for an outgoing interaction', async () => {
    const user = userEvent.setup();
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const { container } = render(
      <RichTextEditor
        value=""
        onChange={vi.fn()}
        onBlur={vi.fn()}
        conditionalTargets={[{ id: 'next', title: 'Next scene' }]}
      />,
    );

    const addButton = within(container).getByRole('button', {
      name: 'Add conditional text',
    });
    expect(addButton).toHaveAttribute('title', 'Add conditional text');
    await user.click(addButton);
    await user.selectOptions(within(container).getByLabelText('Conditional text target'), 'next');

    expect(execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('data-conditional-text-target="next"'),
    );
    expect(execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('data-conditional-text-link="next"'),
    );
    expect(execCommand).toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('aria-label="Open target interaction: Next scene"'),
    );
  });

  it('hides conditional text in reading and explains unavailable simulation text', () => {
    const html =
      '<div data-conditional-text-target="next"><button data-conditional-text-link="next">Next</button><p>Clue</p></div>';
    const { rerender } = render(
      <RichTextContent
        html={html}
        conditionalTextState={{
          next: { visible: false, available: false, reason: 'Condition failed.' },
        }}
      />,
    );
    expect(screen.queryByText('Clue')).not.toBeInTheDocument();

    rerender(
      <RichTextContent
        html={html}
        conditionalTextState={{
          next: { visible: true, available: false, reason: 'Condition failed.' },
        }}
      />,
    );
    expect(screen.getByText('Clue').closest('.conditional-text')).toHaveClass(
      'conditional-text-unavailable',
    );
    expect(screen.getByText('Condition failed.')).toBeInTheDocument();
  });
});
