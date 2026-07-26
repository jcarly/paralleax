import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { InteractionInspector } from './InteractionInspector';

afterEach(cleanup);

describe('InteractionInspector time', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Add item effect' }));
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      itemEffects: [{ itemId: 'key-1', operation: 'obtain' }],
    });

    const withEffect = {
      ...interaction,
      itemEffects: [{ itemId: 'key-1', operation: 'obtain' as const }],
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
    expect(screen.getByRole('option', { name: 'Mira — Key #1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Mira — Key #2' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Affected item'), {
      target: { value: 'key-2' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      itemEffects: [{ itemId: 'key-2', operation: 'obtain' }],
    });
    fireEvent.change(screen.getByLabelText('Item effect operation'), {
      target: { value: 'lose' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', {
      itemEffects: [{ itemId: 'key-1', operation: 'lose' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete item effect' }));
    expect(onPatch).toHaveBeenLastCalledWith('interaction-1', { itemEffects: [] });
  });
});
