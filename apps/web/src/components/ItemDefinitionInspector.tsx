import type { ItemDefinition } from '@paralleax/shared';

export function ItemDefinitionInspector({
  itemDefinition,
  onChange,
  onPatch,
}: {
  itemDefinition: ItemDefinition;
  onChange: (next: ItemDefinition) => void;
  onPatch: (
    id: string,
    patch: Partial<Pick<ItemDefinition, 'name' | 'description'>>,
  ) => Promise<void>;
}) {
  return (
    <div>
      <h3>Item</h3>
      <label>
        Name
        <input
          value={itemDefinition.name}
          onChange={(event) => onChange({ ...itemDefinition, name: event.target.value })}
          onBlur={(event) => void onPatch(itemDefinition.id, { name: event.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          rows={7}
          value={itemDefinition.description}
          onChange={(event) => onChange({ ...itemDefinition, description: event.target.value })}
          onBlur={(event) => void onPatch(itemDefinition.id, { description: event.target.value })}
        />
      </label>
      <p className="hint">
        Each time this item is added to a character, a separate owned instance is created.
      </p>
    </div>
  );
}
