import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CharacterInspector } from './CharacterInspector';

describe('CharacterInspector', () => {
  it('edits character fields, assigns definitions, and updates an existing stat', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const onCreateStat = vi.fn().mockResolvedValue(undefined);
    const onPatchStat = vi.fn().mockResolvedValue(undefined);
    const onCreateItem = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <CharacterInspector
        character={{
          id: 'character-1',
          name: 'Mira',
          description: 'An archivist.',
          imageUrl: 'https://images.example/mira.png',
          stats: [
            {
              id: 'stat-1',
              statDefinitionId: 'stat-definition-1',
              initialValue: 2,
            },
          ],
          items: [
            { id: 'item-1', itemDefinitionId: 'item-definition-1' },
            { id: 'item-unknown', itemDefinitionId: 'missing-item-definition' },
          ],
        }}
        statDefinitions={[
          {
            id: 'stat-definition-1',
            name: 'Trust',
            imageUrl: 'https://images.example/trust.png',
          },
          { id: 'stat-definition-2', name: 'Courage' },
          { id: 'stat-definition-3', name: 'Insight' },
        ]}
        itemDefinitions={[
          {
            id: 'item-definition-1',
            name: 'Key',
            description: '',
            imageUrl: 'https://images.example/key.png',
            stats: [{ statDefinitionId: 'stat-definition-1', initialValue: 7 }],
          },
          { id: 'item-definition-2', name: 'Map', description: '' },
        ]}
        onChange={onChange}
        onPatch={onPatch}
        onCreateStat={onCreateStat}
        onPatchStat={onPatchStat}
        onCreateItem={onCreateItem}
      />,
    );

    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Mira Vale' } });
    (name as HTMLInputElement).value = 'Mira Vale';
    fireEvent.blur(name);
    expect(onPatch).toHaveBeenLastCalledWith('character-1', { name: 'Mira Vale' });
    expect(container.querySelectorAll('img')).toHaveLength(3);

    const image = screen.getByLabelText('Image URL');
    fireEvent.change(image, { target: { value: 'https://images.example/mira-new.png' } });
    fireEvent.blur(image, { target: { value: 'https://images.example/mira-new.png' } });
    expect(onPatch).toHaveBeenLastCalledWith('character-1', {
      imageUrl: 'https://images.example/mira-new.png',
    });

    await user.selectOptions(screen.getByLabelText('Stat to add'), 'stat-definition-3');
    await user.click(screen.getByRole('button', { name: 'Add stat' }));
    expect(onCreateStat).toHaveBeenCalledWith('character-1', 'stat-definition-3');

    const initialValue = screen.getByLabelText('Initial value');
    fireEvent.change(initialValue, { target: { value: '5' } });
    (initialValue as HTMLInputElement).value = '5';
    fireEvent.blur(initialValue);
    expect(onChange).toHaveBeenCalledWith({
      stats: [
        {
          id: 'stat-1',
          statDefinitionId: 'stat-definition-1',
          initialValue: 5,
        },
      ],
    });
    expect(onPatchStat).toHaveBeenLastCalledWith('character-1', 'stat-1', {
      initialValue: 5,
    });

    await user.selectOptions(screen.getByLabelText('Item to add'), 'item-definition-2');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onCreateItem).toHaveBeenCalledWith('character-1', 'item-definition-2');
    expect(screen.getAllByText('Key')).toHaveLength(2);
    expect(screen.getByText(/Trust: 7/)).toBeInTheDocument();
    expect(screen.getByText('Unknown item')).toBeInTheDocument();

    const description = screen.getByLabelText('Description');
    fireEvent.change(description, { target: { value: 'Keeper of the archive.' } });
    (description as HTMLTextAreaElement).value = 'Keeper of the archive.';
    fireEvent.blur(description);
    expect(onPatch).toHaveBeenLastCalledWith('character-1', {
      description: 'Keeper of the archive.',
    });
  });

  it('explains empty definitions and an empty inventory', () => {
    render(
      <CharacterInspector
        character={{
          id: 'character-1',
          name: 'Mira',
          description: '',
        }}
        statDefinitions={[]}
        itemDefinitions={[]}
        onChange={vi.fn()}
        onPatch={vi.fn()}
        onCreateStat={vi.fn()}
        onPatchStat={vi.fn()}
        onCreateItem={vi.fn()}
      />,
    );

    expect(screen.getByText('Create a stat in the story context first.')).toBeInTheDocument();
    expect(screen.getByText('Create an item in the story context first.')).toBeInTheDocument();
    expect(screen.getByText('No items owned yet.')).toBeInTheDocument();
  });
});
