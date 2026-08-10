import type { Location } from '@paralleax/shared';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';

export function LocationInspector({
  location,
  categorySuggestions = [],
  onLocalChange,
  onPatch,
}: {
  location: Location;
  categorySuggestions?: string[];
  onLocalChange: (location: Location) => void;
  onPatch: (
    locationId: string,
    patch: Partial<Pick<Location, 'name' | 'description' | 'category' | 'imageUrl'>>,
  ) => Promise<void>;
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
