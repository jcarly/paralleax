import type {
  ItemDefinition,
  Location,
  MoveItemInstanceInput,
  StatDefinition,
} from '@paralleax/shared';
import { ImageUrlField } from './ImageUrlField';
import { ItemInstanceTree } from './ItemInstanceTree';

export function LocationInspector({
  location,
  onLocalChange,
  onPatch,
  itemDefinitions,
  statDefinitions,
  onMoveItem,
}: {
  location: Location;
  onLocalChange: (location: Location) => void;
  onPatch: (
    locationId: string,
    patch: Partial<Pick<Location, 'name' | 'description' | 'imageUrl'>>,
  ) => Promise<void>;
  itemDefinitions: ItemDefinition[];
  statDefinitions: StatDefinition[];
  onMoveItem: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
}) {
  return (
    <div>
      <h3>Location</h3>
      <label>
        Name
        <input
          value={location.name}
          onChange={(event) => onLocalChange({ ...location, name: event.target.value })}
          onBlur={(event) => void onPatch(location.id, { name: event.target.value })}
        />
      </label>
      <ImageUrlField
        imageUrl={location.imageUrl}
        onChange={(imageUrl) => onLocalChange({ ...location, imageUrl })}
        onBlur={(imageUrl) => void onPatch(location.id, { imageUrl })}
      />
      <h3>Items</h3>
      {(location.items ?? []).length === 0 ? (
        <p className="hint">No items at this location.</p>
      ) : (
        <ItemInstanceTree
          items={location.items ?? []}
          itemDefinitions={itemDefinitions}
          statDefinitions={statDefinitions}
          rootPlacement={{ locationId: location.id }}
          onMove={onMoveItem}
        />
      )}
      <label>
        Description
        <textarea
          rows={7}
          value={location.description}
          onChange={(event) => onLocalChange({ ...location, description: event.target.value })}
          onBlur={(event) => void onPatch(location.id, { description: event.target.value })}
        />
      </label>
    </div>
  );
}
