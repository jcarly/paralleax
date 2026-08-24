import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemDefinitionInspector } from './ItemDefinitionInspector';

describe('ItemDefinitionInspector', () => {
  afterEach(cleanup);
  it('locally edits and persists the item name, image, and description', () => {
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);

    render(
      <ItemDefinitionInspector
        statDefinitions={[]}
        itemDefinition={{
          id: 'item-definition-1',
          name: 'Key',
          description: 'A brass key.',
        }}
        onChange={onChange}
        onPatch={onPatch}
      />,
    );

    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Archive key' } });
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'item-definition-1',
      name: 'Archive key',
      description: 'A brass key.',
    });
    (name as HTMLInputElement).value = 'Archive key';
    fireEvent.blur(name);
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', {
      name: 'Archive key',
    });

    const image = screen.getByLabelText('Image URL');
    fireEvent.change(image, { target: { value: 'https://images.example/key.png' } });
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'item-definition-1',
      name: 'Key',
      description: 'A brass key.',
      imageUrl: 'https://images.example/key.png',
    });
    fireEvent.blur(image, { target: { value: 'https://images.example/key.png' } });
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', {
      imageUrl: 'https://images.example/key.png',
    });

    const description = screen.getByLabelText('Description');
    fireEvent.change(description, { target: { value: 'Opens the archive.' } });
    expect(onChange).toHaveBeenLastCalledWith({
      id: 'item-definition-1',
      name: 'Key',
      description: 'Opens the archive.',
    });
    (description as HTMLTextAreaElement).value = 'Opens the archive.';
    fireEvent.blur(description);
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', {
      description: 'Opens the archive.',
    });
  });

  it('assigns a reusable stat and persists its initial value', () => {
    const onChange = vi.fn();
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const itemDefinition = {
      id: 'item-definition-1',
      name: 'Key',
      description: '',
    };
    const { rerender } = render(
      <ItemDefinitionInspector
        statDefinitions={[
          { id: 'durability', name: 'Durability' },
          { id: 'quality', name: 'Quality' },
        ]}
        itemDefinition={itemDefinition}
        onChange={onChange}
        onPatch={onPatch}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add stat' }));
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', {
      stats: [{ id: expect.any(String), statDefinitionId: 'durability', initialValue: 0 }],
    });

    const withStat = {
      ...itemDefinition,
      stats: [{ id: 'item-durability', statDefinitionId: 'durability', initialValue: 0 }],
    };
    rerender(
      <ItemDefinitionInspector
        statDefinitions={[
          { id: 'durability', name: 'Durability' },
          { id: 'quality', name: 'Quality' },
        ]}
        itemDefinition={withStat}
        onChange={onChange}
        onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByLabelText('Item stat'), {
      target: { value: 'quality' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', {
      stats: [{ id: 'item-durability', statDefinitionId: 'quality', initialValue: 0 }],
    });
    fireEvent.change(screen.getByLabelText('Item stat initial value'), {
      target: { value: '12' },
    });
    fireEvent.blur(screen.getByLabelText('Item stat initial value'), {
      target: { value: '12' },
    });
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', {
      stats: [{ id: 'item-durability', statDefinitionId: 'durability', initialValue: 12 }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete item stat' }));
    expect(onPatch).toHaveBeenLastCalledWith('item-definition-1', { stats: [] });

    rerender(
      <ItemDefinitionInspector
        statDefinitions={[
          { id: 'durability', name: 'Durability' },
          { id: 'quality', name: 'Quality' },
        ]}
        itemDefinition={{
          ...itemDefinition,
          stats: [
            { id: 'item-durability', statDefinitionId: 'durability', initialValue: 10 },
            { id: 'item-quality', statDefinitionId: 'quality', initialValue: 5 },
          ],
        }}
        onChange={onChange}
        onPatch={onPatch}
      />,
    );
    expect(screen.getAllByRole('option', { name: 'Quality' })[0]).toBeDisabled();
    expect(screen.getAllByRole('option', { name: 'Durability' })[1]).toBeDisabled();
  });
});
