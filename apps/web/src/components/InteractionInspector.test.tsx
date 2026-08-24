import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { InteractionInspector } from './InteractionInspector';

afterEach(cleanup);

describe('InteractionInspector time', () => {
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

  it('organizes real interaction fields into content, context, and effect sections', () => {
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

    render(
      <InteractionInspector
        story={story}
        interaction={interaction}
        onChange={vi.fn()}
        onPatch={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByText('Interaction duration')).toBeInTheDocument();
    expect(screen.getByText('1 present')).toBeInTheDocument();
    expect(screen.getByText('MV')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toHaveValue('harbor');

    for (const sectionName of ['Context and timing', 'Effects']) {
      const summary = screen.getByText(sectionName).closest('summary');
      expect(summary?.closest('details')).toHaveAttribute('open');
    }
    for (const emptyEffectGroup of ['Variable effects', 'Item effects']) {
      expect(screen.queryByRole('heading', { name: emptyEffectGroup })).not.toBeInTheDocument();
    }

    const characterOption = screen.getByText('Mira Vale').closest('label');
    expect(within(characterOption!).getByRole('checkbox')).toBeChecked();
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

  it('selects a searchable assigned variable target', () => {
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

    const target = screen.getByLabelText('Variable effect target');
    expect(screen.getByRole('heading', { name: 'Variable effects' })).toBeInTheDocument();
    expect(target).toHaveValue('Mira — Trust');

    fireEvent.change(target, { target: { value: 'Luc — Trust' } });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...interaction.statEffects![0], statId: 'luc-trust' }],
    });

    fireEvent.change(target, {
      target: { value: 'Mira — Health' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...interaction.statEffects![0], statId: 'mira-health' }],
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
    const { container, rerender } = render(
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
    expect(screen.getByText('Variable change 1')).toBeInTheDocument();
    const target = screen.getByLabelText('Variable effect target');
    expect(target).toHaveValue('Mira — Key #1 — Durability');
    expect(screen.getByLabelText('Variable effect target')).toHaveAttribute(
      'list',
      expect.any(String),
    );
    expect(
      container.querySelector('datalist option[value="Home — Key — Durability"]'),
    ).toBeInTheDocument();
    fireEvent.change(target, {
      target: { value: 'Mira — Key #2 — Durability' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      statEffects: [{ ...withEffect.statEffects[0], itemId: 'key-2' }],
    });
    fireEvent.change(target, {
      target: { value: 'Mira — Key #1 — Charge' },
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
