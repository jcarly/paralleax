import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { RichTextContent } from './RichTextContent';
import { RichTextEditor } from '../features/rich-text/RichTextEditor';

describe('RichTextEditor', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'caretRangeFromPoint');
    Reflect.deleteProperty(document, 'elementFromPoint');
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  });

  beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 0, 0),
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => document.body,
    });
  });

  it('edits rich HTML and offers image, GIF, and video insertion', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onBlur = vi.fn();
    vi.spyOn(window, 'prompt')
      .mockReturnValueOnce('https://media.example/scene.gif')
      .mockReturnValueOnce('https://www.youtube.com/watch?v=video-1');

    render(<RichTextEditor value="<p></p>" onChange={onChange} onBlur={onBlur} />);

    const editor = screen.getByRole('textbox', { name: 'Content' });
    await user.click(editor);
    await user.type(editor, 'Opening');
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(editor.innerHTML).toBe('<p><strong>Opening</strong></p>');
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Opening</strong></p>');

    const addImageButton = screen.getByRole('button', { name: /Add image or GIF/ });
    expect(addImageButton).toHaveAccessibleName('Add image or GIF');
    await user.click(addImageButton);
    expect(editor.querySelector('img[src]')).toHaveAttribute(
      'src',
      'https://media.example/scene.gif',
    );

    await user.click(screen.getByRole('button', { name: 'Add video' }));
    expect(editor.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/video-1',
    );
    fireEvent.blur(editor);
    expect(onBlur).toHaveBeenLastCalledWith(onChange.mock.lastCall?.[0]);
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

  it('keeps unsupported authored markup visible and disables edits instead of saving a lossy parse', async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const source = '<p>Keep this</p><script>alert(1)</script>';
    const { container } = render(
      <RichTextEditor value={source} onChange={onChange} onBlur={onBlur} />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This content cannot be edited without losing supported markup.',
    );
    expect(container.querySelector('.ProseMirror')).toHaveAttribute('contenteditable', 'false');
    expect(container.querySelector('pre')).toHaveTextContent(source);
    expect(onChange).not.toHaveBeenCalled();
    expect(onBlur).not.toHaveBeenCalled();
  });

  it('warns before the authored HTML limit and reports content over the limit', async () => {
    const { container, rerender } = render(
      <RichTextEditor
        value="<p>123456789012</p>"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        maxLength={20}
      />,
    );

    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveTextContent(
      '1 character remaining.',
    );
    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveClass(
      'warning',
    );

    rerender(
      <RichTextEditor
        value="<p>123456789012345</p>"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        maxLength={20}
      />,
    );
    await waitFor(() =>
      expect(within(container).getByRole('status', { name: 'Content length' })).toHaveTextContent(
        '2 characters over limit. This content cannot be saved.',
      ),
    );
    expect(within(container).getByRole('status', { name: 'Content length' })).toHaveClass('error');
  });

  it('creates an interaction link through a modal with display text and target', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value=""
        onChange={onChange}
        onBlur={vi.fn()}
        interactionLinkTargets={[{ id: 'next', title: 'Next scene' }]}
      />,
    );

    const addButton = within(container).getByRole('button', {
      name: 'Add interaction link',
    });
    expect(addButton).toHaveAttribute('title', 'Add interaction link');
    await user.click(addButton);
    expect(screen.getByRole('dialog', { name: 'Add an interaction link' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Text to display'), 'Continue');
    await user.selectOptions(screen.getByLabelText('Target interaction'), 'next');

    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(onChange.mock.lastCall?.[0]).toContain('data-interaction-link-target="next"');
    expect(onChange.mock.lastCall?.[0]).toContain('>Continue</span>');
    expect(
      await screen.findByRole('button', { name: 'Edit link Continue to Next scene' }),
    ).toBeInTheDocument();
  });

  it('prefills a new interaction link from the selected text', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RichTextEditor
        value="<p>Continue now</p>"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        interactionLinkTargets={[{ id: 'next', title: 'Next scene' }]}
      />,
    );
    const editor = within(container).getByRole('textbox', { name: 'Content' });
    editor.focus();
    await user.keyboard('{Control>}a{/Control}');

    await user.click(within(container).getByRole('button', { name: 'Add interaction link' }));

    expect(screen.getByLabelText('Text to display')).toHaveValue('Continue now');
  });

  it('creates a conditional frame around the selected rich text with a Trigger condition', async () => {
    const user = userEvent.setup();
    const story = conditionalTextStoryFixture();
    const onConditionalTextChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        interactionId="root"
        story={story}
        value="<p>Before <strong>selected text</strong> after</p>"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onConditionalTextChange={onConditionalTextChange}
      />,
    );
    const editor = within(container).getByRole('textbox', { name: 'Content' });
    editor.focus();
    await user.keyboard('{Control>}a{/Control}');

    await user.click(within(container).getByRole('button', { name: 'Add conditional text' }));
    await user.click(screen.getByRole('button', { name: 'Interaction' }));
    await user.click(screen.getByRole('button', { name: 'Insert' }));

    expect(onConditionalTextChange).toHaveBeenCalledWith(
      expect.stringContaining('data-conditional-text-block="'),
      [
        {
          id: expect.any(String),
          conditions: [{ interactionId: 'next', hasBeenVisited: true }],
        },
      ],
    );
  });

  it('restores selected text when conditional frame creation is cancelled', async () => {
    const user = userEvent.setup();
    const onConditionalTextChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        interactionId="root"
        story={conditionalTextStoryFixture()}
        value="<p>Before <strong>selected text</strong> after</p>"
        onChange={vi.fn()}
        onBlur={vi.fn()}
        onConditionalTextChange={onConditionalTextChange}
      />,
    );
    const editor = within(container).getByRole('textbox', { name: 'Content' });
    editor.focus();
    await user.keyboard('{Control>}a{/Control}');

    await user.click(within(container).getByRole('button', { name: 'Add conditional text' }));
    expect(editor.querySelector('[data-conditional-text-block]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(editor.innerHTML).toBe('<p>Before <strong>selected text</strong> after</p>');
    expect(onConditionalTextChange).not.toHaveBeenCalled();
  });

  it('edits and removes conditional tokens, unwrapping text after the last condition', async () => {
    const user = userEvent.setup();
    const onConditionalTextChange = vi.fn();
    const story = conditionalTextStoryFixture();
    const blocks = [
      {
        id: 'block-1',
        conditions: [{ interactionId: 'next', hasBeenVisited: true }],
      },
    ];
    const { container } = render(
      <RichTextEditor
        interactionId="root"
        story={story}
        value={'<div data-conditional-text-block="block-1"><p>Secret text</p></div>'}
        onChange={vi.fn()}
        onBlur={vi.fn()}
        conditionalTextBlocks={blocks}
        onConditionalTextChange={onConditionalTextChange}
      />,
    );

    await user.click(await within(container).findByRole('button', { name: 'Edit condition' }));
    await user.selectOptions(
      screen.getByLabelText('Interaction condition operator'),
      'not-visited',
    );
    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(onConditionalTextChange).toHaveBeenLastCalledWith(
      expect.stringContaining('data-conditional-text-block="block-1"'),
      [{ id: 'block-1', conditions: [{ interactionId: 'next', hasBeenVisited: false }] }],
    );

    const removeCondition = await within(container).findByRole('button', {
      name: 'Remove condition',
    });
    expect(removeCondition).toHaveClass('rich-text-condition-remove');
    expect(removeCondition).not.toHaveClass('trigger-link-delete');
    await user.click(removeCondition);
    expect(onConditionalTextChange).toHaveBeenLastCalledWith('<p>Secret text</p>', []);
  });

  it('walks story owners and nested items before inserting a stable variable marker', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const story = variableStoryFixture();
    const { container } = render(
      <RichTextEditor value="" onChange={onChange} onBlur={vi.fn()} story={story} />,
    );

    const addVariable = within(container).getByRole('button', { name: /Add variable/ });
    expect(addVariable).toHaveAccessibleName('Add variable');
    await user.click(addVariable);
    expect(screen.getByRole('dialog', { name: 'Add a variable' })).toBeInTheDocument();
    const owner = screen.getByLabelText('Variable owner');
    expect(within(owner).getByRole('option', { name: 'World → Demo' })).toBeInTheDocument();
    expect(within(owner).getByRole('option', { name: 'Character → Mira' })).toBeInTheDocument();
    expect(within(owner).getByRole('option', { name: 'Location → Lab' })).toBeInTheDocument();

    await user.selectOptions(owner, 'owner:character:mira');
    const characterContent = screen.getByLabelText('Variable or item in Mira');
    expect(
      within(characterContent).getByRole('option', { name: 'Variable → Health' }),
    ).toBeInTheDocument();
    expect(
      within(characterContent).getByRole('option', { name: 'Item → Bag' }),
    ).toBeInTheDocument();
    await user.selectOptions(characterContent, 'item:bag');
    await user.selectOptions(screen.getByLabelText('Variable or item in Bag'), 'item:battery');
    await user.selectOptions(
      screen.getByLabelText('Variable or item in Battery'),
      'variable:battery:charge',
    );
    expect(
      within(screen.getByRole('dialog')).getByText('Mira → Bag → Battery → Charge'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(onChange.mock.lastCall?.[0]).toContain('data-stat-value="charge"');
    expect(onChange.mock.lastCall?.[0]).toContain('data-stat-item="battery"');
    expect(onChange.mock.lastCall?.[0]).toContain('{{battery.Charge}}');
    expect(
      await screen.findByRole('button', { name: 'Edit variable Mira → Bag → Battery → Charge' }),
    ).toBeInTheDocument();

    await user.click(addVariable);
    await user.selectOptions(screen.getByLabelText('Variable owner'), 'owner:story:demo');
    await user.selectOptions(
      screen.getByLabelText('Variable or item in Demo'),
      'variable:story:score',
    );
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    expect(onChange.mock.lastCall?.[0]).toContain('data-stat-value="score"');
    expect(onChange.mock.lastCall?.[0]).toContain('{{story.Score}}');
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

    const token = await within(container).findByRole('button', {
      name: 'Edit variable Story → Score',
    });
    await user.click(token);
    expect(screen.getByRole('dialog', { name: 'Edit variable' })).toBeInTheDocument();
    expect(screen.getByLabelText('Variable owner')).toHaveValue('owner:story:demo');
    expect(screen.getByLabelText('Variable or item in Demo')).toHaveValue('variable:story:score');

    await user.selectOptions(screen.getByLabelText('Variable owner'), 'owner:character:mira');
    await user.selectOptions(
      screen.getByLabelText('Variable or item in Mira'),
      'variable:character:health',
    );
    expect(within(screen.getByRole('dialog')).getByText('Mira → Health')).toBeInTheDocument();

    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(onChange.mock.lastCall?.[0]).toContain('data-stat-value="health"');
    expect(onChange.mock.lastCall?.[0]).toContain('{{Mira.Health}}');
    expect(onChange.mock.lastCall?.[0]).not.toContain('aria-label');
    expect(onChange.mock.lastCall?.[0]).not.toContain('rich-text-variable-selected');
    expect(onChange.mock.lastCall?.[0]).not.toContain('data-rich-text-variable');
    expect(onChange.mock.lastCall?.[0]).not.toContain('trigger-link-delete');

    const removeVariable = await within(container).findByRole('button', {
      name: 'Remove variable Mira → Health',
    });
    expect(removeVariable).toHaveClass('rich-text-token-remove');
    expect(removeVariable).not.toHaveClass('trigger-link-delete');
    expect(removeVariable.closest('[data-stat-value]')).toHaveAttribute('contenteditable', 'false');
    await user.click(removeVariable);

    expect(onChange).toHaveBeenLastCalledWith('<p>Value: </p>');
    expect(container.querySelector('[data-stat-value]')).toBeNull();
  });

  it('projects variable token labels from stable ids after entity renames', async () => {
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
      await within(container).findByRole('button', { name: 'Edit variable Mira → Health' }),
    ).toBeInTheDocument();

    const renamedStory = variableStoryFixture();
    renamedStory.characters![0].name = 'Alice';
    renamedStory.statDefinitions![1].name = 'Force';
    rerender(
      <RichTextEditor value={value} onChange={vi.fn()} onBlur={vi.fn()} story={renamedStory} />,
    );

    expect(
      await within(container).findByRole('button', { name: 'Edit variable Alice → Force' }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-stat-value]')).toHaveTextContent('Alice → Force');
    expect(container.querySelector('[data-stat-value]')).not.toHaveTextContent('{{');
  });

  it('exposes variable references as draggable nodes with separate edit controls', async () => {
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
    const token = await within(container).findByRole('button', {
      name: 'Edit variable Story → Score',
    });
    const marker = token.closest<HTMLElement>('[data-stat-value]')!;
    expect(token).toHaveAttribute('draggable', 'true');
    expect(marker.closest('[draggable="true"]')).not.toBeNull();
    expect(editor.innerHTML).toContain('rich-text-token-edit');
    expect(editor.innerHTML).toContain('rich-text-token-remove');
    expect(onChange).not.toHaveBeenCalled();
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

    const token = await within(container).findByRole('button', {
      name: 'Edit link Continue to Next scene',
    });
    expect(token).toHaveTextContent('🔗 Continue | Next scene');
    expect(token).toHaveAttribute('draggable', 'true');
    await user.click(token);
    expect(screen.getByRole('dialog', { name: 'Edit interaction link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Text to display')).toHaveValue('Continue');
    expect(screen.getByLabelText('Target interaction')).toHaveValue('next');

    await user.clear(screen.getByLabelText('Text to display'));
    await user.type(screen.getByLabelText('Text to display'), 'Finish');
    await user.selectOptions(screen.getByLabelText('Target interaction'), 'ending');
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(onChange.mock.lastCall?.[0]).toContain('data-interaction-link-target="ending"');
    expect(onChange.mock.lastCall?.[0]).toContain('>Finish</span>');
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
      await within(container).findByRole('button', { name: 'Edit link Finish to Final chapter' }),
    ).toHaveTextContent('🔗 Finish | Final chapter');

    await user.click(
      await within(container).findByRole('button', {
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

  it('projects structured conditional frames in reader and simulation modes', () => {
    const html = '<div data-conditional-text-block="clue"><p>Structured clue</p></div>';
    const { container, rerender } = render(
      <RichTextContent
        html={html}
        conditionalTextBlockState={{
          clue: { visible: false, available: false, reason: 'Condition failed.' },
        }}
      />,
    );
    expect(within(container).queryByText('Structured clue')).not.toBeInTheDocument();

    rerender(
      <RichTextContent
        html={html}
        conditionalTextBlockState={{
          clue: { visible: true, available: false, reason: 'Condition failed.' },
        }}
      />,
    );
    expect(within(container).getByText('Structured clue').closest('.conditional-text')).toHaveClass(
      'conditional-text-unavailable',
    );
    expect(within(container).getByText('Condition failed.')).toBeInTheDocument();
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

  it('keeps legacy conditional links navigable from the Reader projection', async () => {
    const user = userEvent.setup();
    const onInteractionLinkClick = vi.fn();
    const html =
      '<div data-conditional-text-target="next">' +
      '<button data-conditional-text-link="next">Next</button><p>Clue</p></div>';
    const { rerender } = render(
      <RichTextContent
        html={html}
        conditionalTextState={{ next: { visible: true, available: true } }}
        onInteractionLinkClick={onInteractionLinkClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onInteractionLinkClick).toHaveBeenCalledWith('next');

    rerender(
      <RichTextContent
        html={html}
        conditionalTextState={{
          next: { visible: true, available: false, reason: 'Condition failed.' },
        }}
        onInteractionLinkClick={onInteractionLinkClick}
      />,
    );
    const unavailableLink = screen.getByRole('button', { name: 'Next' });
    expect(unavailableLink).toBeDisabled();
    expect(unavailableLink).toHaveAttribute('title', 'Condition failed.');
    await user.click(unavailableLink);
    expect(onInteractionLinkClick).toHaveBeenCalledOnce();
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

  it('keeps legacy plain-text interaction bodies editable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor value="Legacy plain text" onChange={onChange} onBlur={vi.fn()} />);

    const editor = screen.getByRole('textbox', { name: 'Content' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(editor);
    await user.type(editor, '!');

    expect(editor).toHaveTextContent(/(?:!Legacy plain text|Legacy plain text!)/);
    expect(onChange).toHaveBeenCalledWith(
      expect.stringMatching(/<p>(?:!Legacy plain text|Legacy plain text!)<\/p>/),
    );
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

function conditionalTextStoryFixture(): Story {
  return {
    id: 'conditional-story',
    title: 'Conditional story',
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [],
      },
      {
        id: 'next',
        title: 'Next',
        body: '',
        position: { x: 0, y: 100 },
        triggers: [],
      },
    ],
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
}
