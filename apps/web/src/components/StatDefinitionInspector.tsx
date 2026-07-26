import type { StatDefinition } from '@paralleax/shared';
import { ImageUrlField } from './ImageUrlField';

export function StatDefinitionInspector({
  statDefinition,
  onChange,
  onPatch,
}: {
  statDefinition: StatDefinition;
  onChange: (next: StatDefinition) => void;
  onPatch: (id: string, patch: { name?: string; imageUrl?: string }) => Promise<void>;
}) {
  return (
    <div>
      <h3>Stat</h3>
      <label>
        Name
        <input
          value={statDefinition.name}
          onChange={(event) => onChange({ ...statDefinition, name: event.target.value })}
          onBlur={(event) => void onPatch(statDefinition.id, { name: event.target.value })}
        />
      </label>
      <ImageUrlField
        label="Pictogram URL"
        imageUrl={statDefinition.imageUrl}
        onChange={(imageUrl) => onChange({ ...statDefinition, imageUrl })}
        onBlur={(imageUrl) => void onPatch(statDefinition.id, { imageUrl })}
      />
      <p className="hint">
        Add this reusable stat to any character, then set that character&apos;s initial value.
      </p>
    </div>
  );
}
