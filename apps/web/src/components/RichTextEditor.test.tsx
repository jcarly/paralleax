import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { RichTextContent } from './RichTextContent';
import { RichTextEditor } from './RichTextEditor';

describe('RichTextEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'caretRangeFromPoint');
  });

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

  it('creates an interaction link through a modal with display text and target', async () => {
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
        interactionLinkTargets={[{ id: 'next', title: 'Next scene' }]}
      />,
    );

    const addButton = within(container).getByRole('button', {
      name: 'Add interaction link',
    });
    expect(addButton).toHaveAttribute('title', 'Add interaction link');
    await user.click(addButton);
    expect(
      within(container).getByRole('dialog', { name: 'Add an interaction link' }),
    ).toBeInTheDocument();
    await user.type(within(container).getByLabelText('Text to display'), 'Continue');
    await user.selectOptions(within(container).getByLabelText('Target interaction'), 'next');

    expect(execCommand).not.toHaveBeenCalled();
    await user.click(within(container).getByRole('button', { name: 'Insert' }));
    expect(execCommand).toHaveBeenLastCalledWith(
      'insertHTML',
      false,
      '<span contenteditable="false" data-interaction-link-target="next">Continue</span>',
    );
  });

  it('walks story owners and nested items before inserting a stable variable marker', async () => {
    const user = userEvent.setup();
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const story = variableStoryFixture();
    const { container } = render(
      <RichTextEditor value="" onChange={vi.fn()} onBlur={vi.fn()} story={story} />,
    );

    const addVariable = within(container).getByRole('button', { name: 'Add variable' });
    await user.click(addVariable);
    expect(within(container).getByRole('dialog', { name: 'Add a variable' })).toBeInTheDocument();
    const owner = within(container).getByLabelText('Variable owner');
    expect(within(owner).getByRole('option', { name: 'Story — Demo' })).toBeInTheDocument();
    expect(within(owner).getByRole('option', { name: 'Character — Mira' })).toBeInTheDocument();
    expect(within(owner).getByRole('option', { name: 'Location — Lab' })).toBeInTheDocument();

    await user.selectOptions(owner, 'owner:character:mira');
    const characterContent = within(container).getByLabelText('Variable or item in Mira');
    expect(
      within(characterContent).getByRole('option', { name: 'Variable — Health' }),
    ).toBeInTheDocument();
    expect(
      within(characterContent).getByRole('option', { name: 'Item — Bag' }),
    ).toBeInTheDocument();
    await user.selectOptions(characterContent, 'item:bag');
    await user.selectOptions(
      within(container).getByLabelText('Variable or item in Bag'),
      'item:battery',
    );
    await user.selectOptions(
      within(container).getByLabelText('Variable or item in Battery'),
      'variable:battery:charge',
    );
    expect(within(container).getByText('Mira → Bag → Battery → Charge')).toBeInTheDocument();

    expect(execCommand).not.toHaveBeenCalledWith(
      'insertHTML',
      false,
      expect.stringContaining('data-stat-value="charge"'),
    );
    await user.click(within(container).getByRole('button', { name: 'Insert' }));

    expect(execCommand).toHaveBeenLastCalledWith(
      'insertHTML',
      false,
      '<span contenteditable="false" data-stat-value="charge" data-stat-item="battery">{{battery.Charge}}</span>',
    );

    await user.click(addVariable);
    await user.selectOptions(
      within(container).getByLabelText('Variable owner'),
      'owner:story:demo',
    );
    await user.selectOptions(
      within(container).getByLabelText('Variable or item in Demo'),
      'variable:story:score',
    );
    await user.click(within(container).getByRole('button', { name: 'Insert' }));
    expect(execCommand).toHaveBeenLastCalledWith(
      'insertHTML',
      false,
      '<span contenteditable="false" data-stat-value="score">{{story.Score}}</span>',
    );
  });

  it('edits and removes an existing variable token without persisting editor controls', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value={
          '<p>Value: <span contenteditable="false" data-stat-value="score">{{story.Score}}</span></p>'
        }
        onChange={onChange}
        onBlur={vi.fn()}
        story={variableStoryFixture()}
      />,
    );

    const token = within(container).getByRole('button', {
      name: 'Edit variable Story → Score',
    });
    await user.click(token);
    expect(within(container).getByRole('dialog', { name: 'Edit variable' })).toBeInTheDocument();
    expect(within(container).getByLabelText('Variable owner')).toHaveValue('owner:story:demo');
    expect(within(container).getByLabelText('Variable or item in Demo')).toHaveValue(
      'variable:story:score',
    );

    await user.selectOptions(
      within(container).getByLabelText('Variable owner'),
      'owner:character:mira',
    );
    await user.selectOptions(
      within(container).getByLabelText('Variable or item in Mira'),
      'variable:character:health',
    );
    expect(within(container).getByText('Mira → Health')).toBeInTheDocument();

    expect(onChange).not.toHaveBeenCalled();
    await user.click(within(container).getByRole('button', { name: 'Update' }));

    expect(onChange).toHaveBeenLastCalledWith(
      '<p>Value: <span contenteditable="false" data-stat-value="health">{{Mira.Health}}</span></p>',
    );
    expect(onChange.mock.lastCall?.[0]).not.toContain('aria-label');
    expect(onChange.mock.lastCall?.[0]).not.toContain('rich-text-variable-selected');
    expect(onChange.mock.lastCall?.[0]).not.toContain('data-rich-text-variable');
    expect(onChange.mock.lastCall?.[0]).not.toContain('trigger-link-delete');

    const removeVariable = within(container).getByRole('button', {
      name: 'Remove variable Mira → Health',
    });
    expect(removeVariable).toHaveClass('trigger-link-delete', 'rich-text-token-remove');
    await user.click(removeVariable);

    expect(onChange).toHaveBeenLastCalledWith('<p>Value: </p>');
    expect(container.querySelector('[data-stat-value]')).toBeNull();
  });

  it('projects variable token labels from stable ids after entity renames', () => {
    const value =
      '<p>Value: <span contenteditable="false" data-stat-value="health">{{Mira.Health}}</span></p>';
    const { container, rerender } = render(
      <RichTextEditor
        value={value}
        onChange={vi.fn()}
        onBlur={vi.fn()}
        story={variableStoryFixture()}
      />,
    );

    expect(
      within(container).getByRole('button', { name: 'Edit variable Mira → Health' }),
    ).toBeInTheDocument();

    const renamedStory = variableStoryFixture();
    renamedStory.characters![0].name = 'Alice';
    renamedStory.statDefinitions![1].name = 'Force';
    rerender(
      <RichTextEditor value={value} onChange={vi.fn()} onBlur={vi.fn()} story={renamedStory} />,
    );

    expect(
      within(container).getByRole('button', { name: 'Edit variable Alice → Force' }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-stat-value]')).toHaveTextContent('Alice → Force');
    expect(container.querySelector('[data-stat-value]')).not.toHaveTextContent('{{');
  });

  it('moves a variable token within the rich text without persisting drag controls', () => {
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value={
          '<p>Before <span contenteditable="false" data-stat-value="score">{{story.Score}}</span> after.</p>'
        }
        onChange={onChange}
        onBlur={vi.fn()}
        story={variableStoryFixture()}
      />,
    );
    const editor = within(container).getByRole('textbox', { name: 'Content' });
    const token = within(container).getByRole('button', {
      name: 'Edit variable Story → Score',
    });
    const marker = token.closest<HTMLElement>('[data-stat-value]')!;
    const targetText = [...editor.querySelector('p')!.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent === ' after.',
    )!;
    const dropRange = document.createRange();
    dropRange.setStart(targetText, targetText.textContent!.length);
    dropRange.collapse(true);
    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: vi.fn(() => dropRange),
    });
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: vi.fn(),
    };

    expect(token).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(token, { dataTransfer });
    expect(marker).toHaveClass('rich-text-token-dragging');
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'Story → Score');

    fireEvent.dragOver(editor, { clientX: 80, clientY: 20, dataTransfer });
    expect(dataTransfer.dropEffect).toBe('move');
    fireEvent.drop(editor, { clientX: 80, clientY: 20, dataTransfer });

    expect(marker).not.toHaveClass('rich-text-token-dragging');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(
      '<p>Before  after.<span contenteditable="false" data-stat-value="score">{{story.Score}}</span></p>',
    );
    expect(onChange.mock.lastCall?.[0]).not.toContain('draggable');
    expect(onChange.mock.lastCall?.[0]).not.toContain('rich-text-token-dragging');
  });

  it('edits, reprojects, and removes an interaction link token', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container, rerender } = render(
      <RichTextEditor
        value={
          '<p><span contenteditable="false" data-interaction-link-target="next">Continue</span></p>'
        }
        onChange={onChange}
        onBlur={vi.fn()}
        interactionLinkTargets={[
          { id: 'next', title: 'Next scene' },
          { id: 'ending', title: 'Ending' },
        ]}
      />,
    );

    const token = within(container).getByRole('button', {
      name: 'Edit link Continue to Next scene',
    });
    expect(token).toHaveTextContent('🔗 Continue | Next scene');
    expect(token).toHaveAttribute('draggable', 'true');
    await user.click(token);
    expect(
      within(container).getByRole('dialog', { name: 'Edit interaction link' }),
    ).toBeInTheDocument();
    expect(within(container).getByLabelText('Text to display')).toHaveValue('Continue');
    expect(within(container).getByLabelText('Target interaction')).toHaveValue('next');

    await user.clear(within(container).getByLabelText('Text to display'));
    await user.type(within(container).getByLabelText('Text to display'), 'Finish');
    await user.selectOptions(within(container).getByLabelText('Target interaction'), 'ending');
    await user.click(within(container).getByRole('button', { name: 'Update' }));

    expect(onChange).toHaveBeenLastCalledWith(
      '<p><span contenteditable="false" data-interaction-link-target="ending">Finish</span></p>',
    );
    expect(onChange.mock.lastCall?.[0]).not.toContain('data-rich-text-interaction-link');

    rerender(
      <RichTextEditor
        value={onChange.mock.lastCall![0]}
        onChange={onChange}
        onBlur={vi.fn()}
        interactionLinkTargets={[
          { id: 'next', title: 'Next scene' },
          { id: 'ending', title: 'Final chapter' },
        ]}
      />,
    );
    expect(
      within(container).getByRole('button', { name: 'Edit link Finish to Final chapter' }),
    ).toHaveTextContent('🔗 Finish | Final chapter');

    await user.click(
      within(container).getByRole('button', {
        name: 'Remove link Finish to Final chapter',
      }),
    );
    expect(onChange).toHaveBeenLastCalledWith('<p></p>');
  });

  it('commits the source content before following a conditional interaction link', () => {
    const events: string[] = [];
    const onBlur = vi.fn(() => events.push('blur'));
    const onConditionalTargetClick = vi.fn(() => events.push('navigate'));
    const { container } = render(
      <RichTextEditor
        value={
          '<div data-conditional-text-target="next"><button data-conditional-text-link="next">Next</button><p>Source-only clue</p></div>'
        }
        onChange={vi.fn()}
        onBlur={onBlur}
        onConditionalTargetClick={onConditionalTargetClick}
      />,
    );

    within(container).getByRole('textbox', { name: 'Content' }).focus();
    fireEvent.click(within(container).getByRole('button', { name: 'Next' }));

    expect(onBlur).toHaveBeenCalledWith(expect.stringContaining('Source-only clue'));
    expect(onConditionalTargetClick).toHaveBeenCalledWith('next');
    expect(events).toEqual(['blur', 'navigate']);
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

  it('renders interaction links as reader controls without bypassing unavailable targets', async () => {
    const user = userEvent.setup();
    const onInteractionLinkClick = vi.fn();
    render(
      <RichTextContent
        html={
          '<p><span data-interaction-link-target="next">Continue</span> or ' +
          '<span data-interaction-link-target="hidden">Secret</span></p>'
        }
        conditionalTextState={{
          next: { visible: true, available: true },
          hidden: { visible: true, available: false, reason: 'Condition failed.' },
        }}
        onInteractionLinkClick={onInteractionLinkClick}
      />,
    );

    const availableLink = screen.getByRole('button', { name: 'Continue' });
    const unavailableLink = screen.getByRole('button', { name: 'Secret' });
    expect(unavailableLink).toBeDisabled();
    expect(unavailableLink).toHaveAttribute('title', 'Condition failed.');
    await user.click(unavailableLink);
    expect(onInteractionLinkClick).not.toHaveBeenCalled();
    await user.click(availableLink);
    expect(onInteractionLinkClick).toHaveBeenCalledWith('next');
  });

  it('renders inert typed-stat interpolation markers from replayed values', () => {
    const html =
      '<p>Score: <span data-stat-value="score"></span></p>' +
      '<p>Charge: <span data-stat-value="charge" data-stat-item="battery"></span></p>';
    render(
      <RichTextContent
        html={html}
        statValues={{ score: 7 }}
        itemStatValues={{ battery: { charge: 3 } }}
      />,
    );

    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'P' && element.textContent === 'Score: 7',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'P' && element.textContent === 'Charge: 3',
      ),
    ).toBeInTheDocument();
  });

  it('hides unresolved author references without altering interpolated string values', () => {
    render(
      <RichTextContent
        html={
          '<p>Known: <span data-stat-value="message">{{Mira.Message}}</span></p>' +
          '<p>Unknown: {{Unknown.Message}}</p>' +
          '<p>Malformed: {{}}</p>'
        }
        statValues={{ message: 'Keep {{literal}}' }}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' && element.textContent === 'Known: Keep {{literal}}',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Unknown:')).toBeInTheDocument();
    expect(screen.getByText('Malformed:')).toBeInTheDocument();
    expect(screen.queryByText(/Unknown\.Message/)).not.toBeInTheDocument();
  });
});

function variableStoryFixture(): Story {
  return {
    id: 'demo',
    title: 'Demo',
    statDefinitions: [
      { id: 'score-definition', name: 'Score' },
      { id: 'health-definition', name: 'Health' },
      { id: 'danger-definition', name: 'Danger' },
      { id: 'charge-definition', name: 'Charge' },
    ],
    stats: [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 0 }],
    characters: [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'health', statDefinitionId: 'health-definition', initialValue: 10 }],
        items: [
          { id: 'bag', itemDefinitionId: 'bag-definition' },
          {
            id: 'battery',
            itemDefinitionId: 'battery-definition',
            parentItemId: 'bag',
            relationshipType: 'contained',
          },
        ],
      },
    ],
    locations: [
      {
        id: 'lab',
        name: 'Lab',
        description: '',
        stats: [{ id: 'danger', statDefinitionId: 'danger-definition', initialValue: 1 }],
      },
    ],
    itemDefinitions: [
      { id: 'bag-definition', name: 'Bag', description: '' },
      {
        id: 'battery-definition',
        name: 'Battery',
        description: '',
        stats: [{ id: 'charge', statDefinitionId: 'charge-definition', initialValue: 3 }],
      },
    ],
    interactions: [],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}
