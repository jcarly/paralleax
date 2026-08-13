import type {
  ItemDefinition,
  Location,
  MoveItemInstanceInput,
  StatDefinition,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';
import { ItemInstanceTree } from './ItemInstanceTree';

export function LocationInspector({
  location,
  categorySuggestions = [],
  onLocalChange,
  onPatch,
  itemDefinitions,
  statDefinitions,
  onMoveItem,
}: {
  location: Location;
  categorySuggestions?: string[];
  onLocalChange: (location: Location) => void;
  onPatch: (
    locationId: string,
    patch: Partial<Pick<Location, 'name' | 'description' | 'category' | 'imageUrl'>>,
  ) => Promise<void>;
  itemDefinitions: ItemDefinition[];
  statDefinitions: StatDefinition[];
  onMoveItem: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3>{t('inspector.location')}</h3>
      <label>
        {t('inspector.name')}
        <input
          value={location.name}
          onChange={(event) => onLocalChange({ ...location, name: event.target.value })}
          onBlur={(event) => void onPatch(location.id, { name: event.target.value })}
        />
      </label>
      <CategoryField
        category={location.category}
        suggestions={categorySuggestions}
        onChange={(category) => onLocalChange({ ...location, category })}
        onBlur={(category) => void onPatch(location.id, { category })}
      />
      <ImageUrlField
        imageUrl={location.imageUrl}
        onChange={(imageUrl) => onLocalChange({ ...location, imageUrl })}
        onBlur={(imageUrl) => void onPatch(location.id, { imageUrl })}
      />
      <h3>{t('inspector.items')}</h3>
      {(location.items ?? []).length === 0 ? (
        <p className="hint">{t('inspector.noLocationItems')}</p>
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
        {t('inspector.description')}
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
