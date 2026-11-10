import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { Story } from '@paralleax/shared';
import { InteractionInspector } from './InteractionInspector';

beforeEach(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 0, 0),
  });
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 0, 0),
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => document.body,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(Range.prototype, 'getClientRects');
  Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  Reflect.deleteProperty(HTMLElement.prototype, 'getClientRects');
  Reflect.deleteProperty(HTMLElement.prototype, 'getBoundingClientRect');
  Reflect.deleteProperty(document, 'elementFromPoint');
});

function openEffectEditor(summaryPattern: RegExp) {
  const summary = screen.getByText(summaryPattern).closest('summary');
  if (!summary) {
    throw new Error('Expected an effect summary.');
  }
  fireEvent.click(summary);
}

function contextStory() {
  const interaction: Story['interactions'][number] = {
    id: 'interaction-1',
    title: 'Meet Mira',
    body: '',
    position: { x: 0, y: 0 },
    locationId: 'harbor',
    characterIds: ['mira'],
    triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
  };
  const story: Story = {
    id: 'story-1',
    title: 'Story',
    locations: [{ id: 'harbor', name: 'Harbor', description: '' }],
    characters: [{ id: 'mira', name: 'Mira Vale', description: '' }],
    interactions: [interaction],
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
  };
  return { interaction, story };
}

function expectPresentationContainsContext(
  titleReadout: HTMLElement,
  locationReadout: HTMLElement,
) {
  const presentation = titleReadout.closest('.interaction-inspector-presentation');
  expect(presentation).toContainElement(locationReadout);
  expect(titleReadout.querySelector('.interaction-label-leading')).toHaveTextContent('→');
}

describe('InteractionInspector time', () => {
  it('reports authored scene content after the save succeeds', async () => {
    const user = userEvent.setup();
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Start',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      interactions: [interaction],
      createdAt: '2026-10-21T08:00:00Z',
      updatedAt: '2026-10-21T08:00:00Z',
    };
    const onPatch = vi.fn(
      async (_id: string, _patch: Partial<Story['interactions'][number]>) => true,
    );
    const onContentSaved = vi.fn();

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={onPatch}
        onContentSaved={onContentSaved}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add content' }));
    const editor = await screen.findByRole('textbox', { name: 'Content' }, { timeout: 5_000 });
    await user.type(editor, 'A scene');
    await user.click(screen.getByRole('button', { name: 'Title: Start' }));

    await waitFor(() => expect(onContentSaved).toHaveBeenCalledOnce());
    const savedPatch = onPatch.mock.calls[0]?.[1];
    expect(savedPatch?.body).toContain('A scene');
  });

  it('does not report scene content when its save fails', async () => {
    const user = userEvent.setup();
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Start',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      interactions: [interaction],
      createdAt: '2026-10-21T08:00:00Z',
      updatedAt: '2026-10-21T08:00:00Z',
    };
    const onPatch = vi.fn().mockResolvedValue(false);
    const onContentSaved = vi.fn();

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={onPatch}
        onContentSaved={onContentSaved}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add content' }));
    const editor = await screen.findByRole('textbox', { name: 'Content' }, { timeout: 5_000 });
    await user.type(editor, 'A scene');
    await user.click(screen.getByRole('button', { name: 'Title: Start' }));

    await waitFor(() => expect(onPatch).toHaveBeenCalled());
    expect(onContentSaved).not.toHaveBeenCalled();
  });

  it.each(['number', 'boolean', 'string'] as const)(
    'switches a %s effect between a literal and an expression',
    (valueType) => {
      const initialValue = valueType === 'number' ? 2 : valueType === 'boolean' ? false : 'calm';
      const initial: Story = {
        id: 'story-1',
        title: 'Story',
        createdAt: '2026-10-21T08:00:00Z',
        updatedAt: '2026-10-21T08:00:00Z',
        statDefinitions: [{ id: 'definition', name: 'State', valueType }],
        stats: [{ id: 'state', statDefinitionId: 'definition', initialValue }],
        interactions: [
          {
            id: 'root',
            title: 'Start',
            body: '',
            position: { x: 0, y: 0 },
            triggers: [],
            statEffects: [{ statId: 'state', operation: 'set', value: initialValue }],
          },
        ],
      };
      const onPatch = vi.fn().mockResolvedValue(undefined);
      function Editor() {
        const [story, setStory] = useState(initial);
        return (
          <InteractionInspector
            story={story}
            interaction={story.interactions[0]}
            onChange={setStory}
            onPatch={onPatch}
            onDelete={vi.fn()}
          />
        );
      }
      render(<Editor />);
      openEffectEditor(/State: set to/);
      fireEvent.click(screen.getByRole('button', { name: 'Use expression' }));
      expect(onPatch).toHaveBeenLastCalledWith('root', {
        statEffects: [
          { statId: 'state', operation: 'set', value: undefined, expression: '@{state}' },
        ],
      });
      fireEvent.change(screen.getByLabelText('Variable effect expression'), {
        target: {
          value:
            valueType === 'number' ? '@{state} + 1' : valueType === 'boolean' ? 'true' : '"alert"',
        },
      });
      fireEvent.blur(screen.getByLabelText('Variable effect expression'));
      expect(onPatch).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole('button', { name: 'Use literal value' }));
      expect(onPatch).toHaveBeenLastCalledWith('root', {
        statEffects: [{ statId: 'state', operation: 'set', value: initialValue }],
      });
      const field = screen.getByLabelText('Variable effect value');
      fireEvent.change(field, {
        target: {
          value: valueType === 'number' ? '7' : valueType === 'boolean' ? 'true' : 'alert',
        },
      });
      fireEvent.blur(field);
      expect(onPatch).toHaveBeenLastCalledWith('root', {
        statEffects: [
          {
            statId: 'state',
            operation: 'set',
            value: valueType === 'number' ? 7 : valueType === 'boolean' ? true : 'alert',
          },
        ],
      });
    },
  );
  it('adds a typed variable assignment effect', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Score',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      statDefinitions: [{ id: 'score-definition', name: 'Score', valueType: 'number' }],
      stats: [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 0 }],
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onPatch = vi.fn().mockResolvedValue(undefined);

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Variable' }));

    expect(onPatch).toHaveBeenCalledWith('interaction-1', {
      statEffects: [{ statId: 'score', operation: 'add', value: 1 }],
    });
  });

  it('shows authored context and content before exposing their editors', async () => {
    const { interaction, story } = contextStory();

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
      />,
    );

    const titleReadout = screen.getByRole('button', { name: 'Title: Meet Mira' });
    const locationReadout = screen.getByRole('button', { name: 'Location: Harbor' });
    expectPresentationContainsContext(titleReadout, locationReadout);
    expect(screen.queryByRole('heading', { name: 'Context and timing' })).not.toBeInTheDocument();
    expect(
      titleReadout.compareDocumentPosition(locationReadout) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();
    expect(screen.queryByText('Describe what happens here.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add content' }));
    expect(
      await screen.findByRole('textbox', { name: 'Content' }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Location: Harbor' })).toBeInTheDocument();
    const charactersReadout = screen.getByRole('button', {
      name: 'Characters present: Mira Vale',
    });
    const durationReadout = screen.getByRole('button', { name: 'Duration: No time change' });
    const locationTooltip = screen.getByText('Harbor');
    const charactersTooltip = screen.getByText('Mira Vale');
    const durationTooltip = screen.getByText('No time change');
    expect(locationReadout).toHaveAttribute('aria-describedby', locationTooltip.id);
    expect(charactersReadout).toHaveAttribute('aria-describedby', charactersTooltip.id);
    expect(durationReadout).toHaveAttribute('aria-describedby', durationTooltip.id);
    expect(charactersReadout).not.toHaveTextContent('Mira Vale');
    expect(durationReadout).not.toHaveTextContent('No time change');
    expect(locationReadout).toHaveTextContent('H');
    expect(screen.getByText('MV')).toBeInTheDocument();
    expect(locationReadout.querySelector('.interaction-metadata-avatar')).toBeInTheDocument();
    expect(charactersReadout.querySelector('.interaction-metadata-avatar')).toBeInTheDocument();
    expect(
      durationReadout.querySelector('[data-interaction-metadata-icon="time"]'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Location: Harbor' }));
    expect(screen.getByLabelText('Location')).toHaveValue('harbor');
    fireEvent.click(screen.getByRole('button', { name: 'Characters present: Mira Vale' }));
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('heading', { name: 'Effects' })).toBeInTheDocument();
  });

  it('lists each outgoing destination once and adds options through its callback', () => {
    const interaction: Story['interactions'][number] = {
      id: 'source',
      title: 'Source',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'source-root', inputInteractionIds: [], conditions: [] }],
    };
    const destination: Story['interactions'][number] = {
      id: 'destination',
      title: 'Destination',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [
        { id: 'route-one', inputInteractionIds: ['source'], conditions: [] },
        { id: 'route-two', inputInteractionIds: ['source'], conditions: [] },
      ],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      interactions: [interaction, destination],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onAddOption = vi.fn();
    const onSelectInteraction = vi.fn();

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
        onAddOption={onAddOption}
        onSelectInteraction={onSelectInteraction}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Destination' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Destination' }));
    expect(onSelectInteraction).toHaveBeenCalledWith('destination');
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(onAddOption).toHaveBeenCalledOnce();
  });

  it('edits and persists a non-negative integer duration', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Wait',
      body: '',
      position: { x: 0, y: 0 },
      durationMinutes: 15,
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={onChange}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duration: 15 minutes' }));
    const duration = screen.getByLabelText('Duration (minutes)');
    fireEvent.change(duration, { target: { value: '42.8' } });
    fireEvent.blur(duration, { target: { value: '42.8' } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        interactions: [expect.objectContaining({ durationMinutes: 42 })],
      }),
    );
    expect(onPatch).toHaveBeenCalledWith('interaction-1', { durationMinutes: 42 });
  });

  it('opens one effect type picker and explains unavailable choices', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Empty interaction',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));

    const picker = screen.getByRole('group', { name: 'Effect type' });
    expect(within(picker).getByRole('button', { name: 'Variable' })).toBeDisabled();
    expect(within(picker).getByRole('button', { name: 'Item inventory' })).toBeDisabled();
    expect(screen.getByText('Create and attach a variable first.')).toHaveAttribute(
      'role',
      'tooltip',
    );
    expect(within(picker).getByRole('button', { name: 'Variable' })).toHaveAttribute(
      'title',
      'Create and attach a variable first.',
    );
  });

  it('selects an assigned variable target from the shared hierarchy', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Build trust',
      body: '',
      position: { x: 0, y: 0 },
      statEffects: [{ statId: 'mira-trust', operation: 'add', value: 1 }],
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      statDefinitions: [
        { id: 'trust', name: 'Trust' },
        { id: 'health', name: 'Health' },
      ],
      characters: [
        {
          id: 'mira',
          name: 'Mira',
          description: '',
          stats: [
            { id: 'mira-trust', statDefinitionId: 'trust', initialValue: 2 },
            { id: 'mira-health', statDefinitionId: 'health', initialValue: 10 },
          ],
        },
        {
          id: 'luc',
          name: 'Luc',
          description: '',
          stats: [{ id: 'luc-trust', statDefinitionId: 'trust', initialValue: 0 }],
        },
      ],
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onPatch = vi.fn().mockResolvedValue(undefined);

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );

    openEffectEditor(/Trust: add 1/);
    const target = screen.getByLabelText('Variable effect target');
    expect(screen.getByRole('heading', { name: 'Variable effects' })).toBeInTheDocument();
    expect(within(target).getAllByRole('combobox')[0]).toHaveValue('owner:character:mira');
    expect(within(target).getAllByRole('combobox')[1]).toHaveValue('variable:character:mira-trust');

    fireEvent.change(within(target).getAllByRole('combobox')[0], {
      target: { value: 'owner:character:luc' },
    });
    fireEvent.change(within(target).getAllByRole('combobox')[1], {
      target: { value: 'variable:character:luc-trust' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...interaction.statEffects![0], statId: 'luc-trust' }],
    });

    fireEvent.change(within(target).getAllByRole('combobox')[0], {
      target: { value: 'owner:character:mira' },
    });
    fireEvent.change(within(target).getAllByRole('combobox')[1], {
      target: { value: 'variable:character:mira-health' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...interaction.statEffects![0], statId: 'mira-health' }],
    });
  });

  it('edits an expression-based variable effect', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Complicate the score',
      body: '',
      position: { x: 0, y: 0 },
      statEffects: [{ statId: 'score', operation: 'add', expression: '@{score} + 2' }],
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      statDefinitions: [{ id: 'score-definition', name: 'Score', valueType: 'number' }],
      stats: [{ id: 'score', statDefinitionId: 'score-definition', initialValue: 1 }],
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onPatch = vi.fn().mockResolvedValue(undefined);

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );

    openEffectEditor(/Score: add/);
    const expressionField = screen.getByLabelText('Variable effect expression');
    expect(expressionField).toHaveValue('@{score} + 2');

    fireEvent.change(expressionField, { target: { value: '@{score} * 3' } });
    fireEvent.blur(expressionField);

    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...interaction.statEffects![0], expression: '@{score} * 3' }],
    });
  });

  it('adds, changes, and removes an item effect for a distinct item instance', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Find the key',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      itemDefinitions: [{ id: 'key-definition', name: 'Key', description: '' }],
      characters: [
        {
          id: 'mira',
          name: 'Mira',
          description: '',
          items: [
            { id: 'key-1', itemDefinitionId: 'key-definition' },
            { id: 'key-2', itemDefinitionId: 'key-definition' },
          ],
        },
        { id: 'luc', name: 'Luc', description: '' },
      ],
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={onChange}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Effect type' })).getByRole('button', {
        name: 'Item inventory',
      }),
    );
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      itemEffects: [
        { itemDefinitionId: 'key-definition', characterId: 'mira', operation: 'obtain' },
      ],
    });

    const withEffect = {
      ...interaction,
      itemEffects: [
        {
          itemDefinitionId: 'key-definition',
          characterId: 'mira',
          operation: 'obtain' as const,
        },
      ],
    };
    rerender(
      <InteractionInspector
        story={{ ...story, interactions: [withEffect] }}
        interaction={withEffect}
        onChange={onChange}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );
    openEffectEditor(/Mira: obtain Key/);
    expect(screen.getByText('Inventory change 1')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Key' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Item effect target'), {
      target: { value: 'Luc' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      itemEffects: [
        { itemDefinitionId: 'key-definition', characterId: 'luc', operation: 'obtain' },
      ],
    });
    fireEvent.change(screen.getByLabelText('Item effect operation'), {
      target: { value: 'lose' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      itemEffects: [{ itemDefinitionId: 'key-definition', characterId: 'mira', operation: 'lose' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete item effect' }));
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', { itemEffects: [] });
  });

  it('adds and edits an effect for one exact item instance stat', () => {
    const interaction: Story['interactions'][number] = {
      id: 'interaction-1',
      title: 'Damage the key',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    };
    const story: Story = {
      id: 'story-1',
      title: 'Story',
      statDefinitions: [
        { id: 'durability', name: 'Durability' },
        { id: 'charge', name: 'Charge' },
      ],
      itemDefinitions: [
        {
          id: 'key-definition',
          name: 'Key',
          description: '',
          stats: [
            { id: 'key-durability', statDefinitionId: 'durability', initialValue: 10 },
            { id: 'key-charge', statDefinitionId: 'charge', initialValue: 3 },
          ],
        },
      ],
      characters: [
        {
          id: 'mira',
          name: 'Mira',
          description: '',
          items: [
            { id: 'key-1', itemDefinitionId: 'key-definition' },
            { id: 'key-2', itemDefinitionId: 'key-definition' },
          ],
        },
      ],
      locations: [
        {
          id: 'home',
          name: 'Home',
          description: '',
          items: [{ id: 'key-at-home', itemDefinitionId: 'key-definition' }],
        },
      ],
      interactions: [interaction],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Effect type' })).getByRole('button', {
        name: 'Variable',
      }),
    );
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [
        {
          itemId: 'key-1',
          statId: 'key-durability',
          operation: 'add',
          value: 1,
        },
      ],
    });

    const withEffect = {
      ...interaction,
      statEffects: [
        {
          itemId: 'key-1',
          statId: 'key-durability',
          operation: 'add' as const,
          value: 1,
        },
      ],
    };
    rerender(
      <InteractionInspector
        story={{ ...story, interactions: [withEffect] }}
        interaction={withEffect}
        onChange={vi.fn()}
        onPatch={onPatch}
        onDelete={vi.fn()}
      />,
    );
    openEffectEditor(/Durability: add/);
    expect(screen.getByText('Variable change 1')).toBeInTheDocument();
    const target = screen.getByLabelText('Variable effect target');
    expect(within(target).getAllByRole('combobox')[1]).toHaveValue('item:key-1');
    expect(within(target).getAllByRole('combobox')[2]).toHaveValue('variable:key-1:key-durability');
    fireEvent.change(within(target).getAllByRole('combobox')[1], {
      target: { value: 'item:key-2' },
    });
    fireEvent.change(within(target).getAllByRole('combobox')[2], {
      target: { value: 'variable:key-2:key-durability' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...withEffect.statEffects[0], itemId: 'key-2' }],
    });
    fireEvent.change(within(target).getAllByRole('combobox')[1], {
      target: { value: 'item:key-1' },
    });
    fireEvent.change(within(target).getAllByRole('combobox')[2], {
      target: { value: 'variable:key-1:key-charge' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...withEffect.statEffects[0], statId: 'key-charge' }],
    });
    fireEvent.change(screen.getByLabelText('Variable effect operation'), {
      target: { value: 'set' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...withEffect.statEffects[0], operation: 'set' }],
    });
    fireEvent.change(screen.getByLabelText('Variable effect value'), {
      target: { value: '-3' },
    });
    fireEvent.blur(screen.getByLabelText('Variable effect value'), {
      target: { value: '-3' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...withEffect.statEffects[0], value: -3 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete variable effect' }));
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [],
    });
  });
});
