import type { Location } from '@paralleax/shared';
import { ImageUrlField } from './ImageUrlField';

export function LocationInspector({
  location,
  onLocalChange,
  onPatch,
}: {
  location: Location;
  onLocalChange: (location: Location) => void;
  onPatch: (
    locationId: string,
    patch: Partial<Pick<Location, 'name' | 'description' | 'imageUrl'>>,
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
