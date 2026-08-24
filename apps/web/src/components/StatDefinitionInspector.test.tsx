import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Story } from '@paralleax/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { StatDefinitionInspector } from './StatDefinitionInspector';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const story: Story = {
  id: 'story-1',
  title: 'Story',
  interactions: [],
  statDefinitions: [{ id: 'energy', name: 'Energy', valueType: 'number' }],
  stats: [{ id: 'story-energy', statDefinitionId: 'energy', initialValue: 4 }],
  characters: [{ id: 'character-1', name: 'Mira', description: '' }],
  locations: [{ id: 'location-1', name: 'Harbor', description: '' }],
  itemDefinitions: [{ id: 'item-1', name: 'Key', description: '' }],
  createdAt: '2026-08-24T00:00:00.000Z',
  updatedAt: '2026-08-24T00:00:00.000Z',
};

describe('StatDefinitionInspector', () => {
  it('edits and persists a positive or negative hourly change', () => {
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <StatDefinitionInspector
        story={story}
        statDefinition={{ id: 'energy', name: 'Energy', changePerHour: -1 }}
        onChange={onChange}
        onPatch={onPatch}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onStory={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const rate = screen.getByLabelText('Change per story hour');
    fireEvent.change(rate, { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'energy',
      name: 'Energy',
      changePerHour: 2.5,
    });
    fireEvent.blur(rate, { target: { value: '-1.5' } });
    expect(onPatch).toHaveBeenLastCalledWith('energy', { changePerHour: -1.5 });
  });

  it('edits the definition and manages assignments from each owner type', async () => {
    const nextStory = { ...story, updatedAt: '2026-08-24T01:00:00.000Z' };
    const updateAssignment = vi.spyOn(api, 'updateStatAssignment').mockResolvedValue(nextStory);
    const deleteAssignment = vi.spyOn(api, 'deleteStatAssignment').mockResolvedValue(nextStory);
    const createAssignment = vi.spyOn(api, 'createStatAssignment').mockResolvedValue(nextStory);
    const deleteDefinition = vi.spyOn(api, 'deleteStatDefinition').mockResolvedValue(nextStory);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const onStory = vi.fn();
    const onClose = vi.fn();

    render(
      <StatDefinitionInspector
        story={story}
        statDefinition={{
          id: 'energy',
          name: 'Energy',
          valueType: 'number',
          category: 'Resources',
        }}
        categorySuggestions={['Resources', 'Relationships']}
        onChange={onChange}
        onPatch={onPatch}
        onCreate={vi.fn().mockResolvedValue(undefined)}
        onStory={onStory}
        onClose={onClose}
      />,
    );

    const name = screen.getByLabelText('Variable name');
    fireEvent.change(name, { target: { value: 'Stamina' } });
    fireEvent.blur(name, { target: { value: 'Stamina' } });
    expect(onPatch).toHaveBeenCalledWith('energy', { name: 'Stamina' });

    const category = screen.getByLabelText('Category');
    fireEvent.change(category, { target: { value: ' Relationships ' } });
    fireEvent.blur(category, { target: { value: ' Relationships ' } });
    expect(onPatch).toHaveBeenCalledWith('energy', { category: 'Relationships' });

    const imageUrl = screen.getByLabelText('Image URL');
    fireEvent.change(imageUrl, { target: { value: 'https://images.example/energy.svg' } });
    fireEvent.blur(imageUrl, { target: { value: 'https://images.example/energy.svg' } });
    expect(onPatch).toHaveBeenCalledWith('energy', {
      imageUrl: 'https://images.example/energy.svg',
    });

    const assignedValue = screen.getByLabelText('Initial value for Story');
    fireEvent.change(assignedValue, { target: { value: '6' } });
    fireEvent.blur(assignedValue, { target: { value: '6' } });
    await waitFor(() =>
      expect(updateAssignment).toHaveBeenCalledWith('story-1', 'story-energy', {
        initialValue: 6,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove variable from Story' }));
    await waitFor(() => expect(deleteAssignment).toHaveBeenCalledWith('story-1', 'story-energy'));

    await userEvent.selectOptions(screen.getByLabelText('Attach to'), 'location:location-1');
    fireEvent.change(screen.getByLabelText('Initial value'), { target: { value: '8' } });
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() =>
      expect(createAssignment).toHaveBeenCalledWith('story-1', {
        statDefinitionId: 'energy',
        ownerType: 'location',
        ownerId: 'location-1',
        initialValue: 8,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete variable' }));
    await waitFor(() => expect(deleteDefinition).toHaveBeenCalledWith('story-1', 'energy'));
    expect(onStory).toHaveBeenCalledWith(nextStory);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
