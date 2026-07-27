import type { ItemDefinition, StatDefinition } from '@paralleax/shared';
import { ImageUrlField } from './ImageUrlField';

export function ItemDefinitionInspector({
  itemDefinition,
  statDefinitions,
  onChange,
  onPatch,
}: {
  itemDefinition: ItemDefinition;
  statDefinitions: StatDefinition[];
  onChange: (next: ItemDefinition) => void;
  onPatch: (
    id: string,
    patch: Partial<Pick<ItemDefinition, 'name' | 'description' | 'imageUrl' | 'stats'>>,
  ) => Promise<void>;
}) {
  const itemStats = itemDefinition.stats ?? [];
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
      <ImageUrlField
        imageUrl={itemDefinition.imageUrl}
        onChange={(imageUrl) => onChange({ ...itemDefinition, imageUrl })}
        onBlur={(imageUrl) => void onPatch(itemDefinition.id, { imageUrl })}
      />
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
      <div className="inspector-section-header">
        <h3>Item stats</h3>
        <button
          className="secondary"
          type="button"
          disabled={itemStats.length >= statDefinitions.length}
          onClick={() => {
            const candidate = statDefinitions.find(
              ({ id }) => !itemStats.some(({ statDefinitionId }) => statDefinitionId === id),
            )!;
            const stats = [...itemStats, { statDefinitionId: candidate.id, initialValue: 0 }];
            onChange({ ...itemDefinition, stats });
            void onPatch(itemDefinition.id, { stats });
          }}
        >
          Add stat
        </button>
      </div>
      {itemStats.map((stat, index) => (
        <div className="stat-effect-row" key={stat.statDefinitionId}>
          <select
            aria-label="Item stat"
            value={stat.statDefinitionId}
            onChange={(event) => {
              const stats = [...itemStats];
              stats[index] = { ...stat, statDefinitionId: event.target.value };
              onChange({ ...itemDefinition, stats });
              void onPatch(itemDefinition.id, { stats });
            }}
          >
            {statDefinitions.map((definition) => (
              <option
                key={definition.id}
                value={definition.id}
                disabled={itemStats.some(
                  (candidate, candidateIndex) =>
                    candidateIndex !== index && candidate.statDefinitionId === definition.id,
                )}
              >
                {definition.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Item stat initial value"
            type="number"
            value={stat.initialValue}
            onChange={(event) => {
              const stats = [...itemStats];
              stats[index] = { ...stat, initialValue: Number(event.target.value) };
              onChange({ ...itemDefinition, stats });
            }}
            onBlur={(event) => {
              const stats = [...itemStats];
              stats[index] = { ...stat, initialValue: Number(event.target.value) };
              void onPatch(itemDefinition.id, { stats });
            }}
          />
          <button
            aria-label="Delete item stat"
            className="ghost danger"
            type="button"
            onClick={() => {
              const stats = itemStats.filter((_, candidateIndex) => candidateIndex !== index);
              onChange({ ...itemDefinition, stats });
              void onPatch(itemDefinition.id, { stats });
            }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
