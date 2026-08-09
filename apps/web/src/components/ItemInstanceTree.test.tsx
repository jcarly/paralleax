import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ItemInstanceTree } from './ItemInstanceTree';

describe('ItemInstanceTree', () => {
  it('moves an item under another instance and keeps relationship metadata editable', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <ItemInstanceTree
        items={[
          { id: 'bag', itemDefinitionId: 'bag-definition' },
          { id: 'key', itemDefinitionId: 'key-definition' },
        ]}
        itemDefinitions={[
          { id: 'bag-definition', name: 'Bag', description: '' },
          { id: 'key-definition', name: 'Key', description: '' },
        ]}
        rootCharacterId="character-1"
        onMove={onMove}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Parent for Key'), 'bag');
    expect(onMove).toHaveBeenLastCalledWith('key', {
      parentItemId: 'bag',
      relationshipType: 'contained',
    });

    rerender(
      <ItemInstanceTree
        items={[
          { id: 'bag', itemDefinitionId: 'bag-definition' },
          {
            id: 'key',
            itemDefinitionId: 'key-definition',
            parentItemId: 'bag',
            relationshipType: 'contained',
          },
        ]}
        itemDefinitions={[
          { id: 'bag-definition', name: 'Bag', description: '' },
          { id: 'key-definition', name: 'Key', description: '' },
        ]}
        rootCharacterId="character-1"
        onMove={onMove}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Relationship for Key'), 'attached');
    expect(onMove).toHaveBeenLastCalledWith('key', {
      parentItemId: 'bag',
      relationshipType: 'attached',
    });

    fireEvent.blur(screen.getByLabelText('Slot for Key'), { target: { value: 'front-loop' } });
    expect(onMove).toHaveBeenLastCalledWith('key', {
      parentItemId: 'bag',
      relationshipType: 'contained',
      slotKey: 'front-loop',
    });

    await user.selectOptions(screen.getByLabelText('Parent for Key'), '');
    expect(onMove).toHaveBeenLastCalledWith('key', { characterId: 'character-1' });
  });

  it('does not offer descendants as parents', () => {
    const { container } = render(
      <ItemInstanceTree
        items={[
          { id: 'bag', itemDefinitionId: 'bag-definition' },
          {
            id: 'key',
            itemDefinitionId: 'key-definition',
            parentItemId: 'bag',
            relationshipType: 'contained',
          },
        ]}
        itemDefinitions={[
          { id: 'bag-definition', name: 'Bag', description: '' },
          { id: 'key-definition', name: 'Key', description: '' },
        ]}
        rootCharacterId="character-1"
        onMove={vi.fn()}
      />,
    );

    expect(container.querySelector('select[aria-label="Parent for Bag"]')).not.toHaveTextContent(
      'Key',
    );
  });
});
