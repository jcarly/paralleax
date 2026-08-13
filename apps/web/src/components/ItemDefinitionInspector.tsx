import type { ItemDefinition, StatDefinition } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';
import { RemoveRowButton } from './RemoveRowButton';

export function ItemDefinitionInspector({
  itemDefinition,
  categorySuggestions = [],
  statDefinitions,
  onChange,
  onPatch,
}: {
  itemDefinition: ItemDefinition;
  categorySuggestions?: string[];
  statDefinitions: StatDefinition[];
  onChange: (next: ItemDefinition) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<ItemDefinition, 'name' | 'description' | 'category' | 'imageUrl' | 'stats'>
    >,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const itemStats = itemDefinition.stats ?? [];
  return (
    <div>
      <h3>{t('inspector.item')}</h3>
      <label>
        {t('inspector.name')}
        <input
          value={itemDefinition.name}
          onChange={(event) => onChange({ ...itemDefinition, name: event.target.value })}
          onBlur={(event) => void onPatch(itemDefinition.id, { name: event.target.value })}
        />
      </label>
      <CategoryField
        category={itemDefinition.category}
        suggestions={categorySuggestions}
        onChange={(category) => onChange({ ...itemDefinition, category })}
        onBlur={(category) => void onPatch(itemDefinition.id, { category })}
      />
      <ImageUrlField
        imageUrl={itemDefinition.imageUrl}
        onChange={(imageUrl) => onChange({ ...itemDefinition, imageUrl })}
        onBlur={(imageUrl) => void onPatch(itemDefinition.id, { imageUrl })}
      />
      <label>
        {t('inspector.description')}
        <textarea
          rows={7}
          value={itemDefinition.description}
          onChange={(event) => onChange({ ...itemDefinition, description: event.target.value })}
          onBlur={(event) => void onPatch(itemDefinition.id, { description: event.target.value })}
        />
      </label>
      <p className="hint">{t('inspector.itemInstanceHelp')}</p>
      <div className="inspector-section-header">
        <h3>{t('inspector.itemStats')}</h3>
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
          {t('inspector.addStat')}
        </button>
      </div>
      {itemStats.map((stat, index) => (
        <div className="stat-effect-row" key={stat.statDefinitionId}>
          <select
            aria-label={t('inspector.itemStat')}
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
            aria-label={t('inspector.itemStatInitialValue')}
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
          <RemoveRowButton
            label={t('inspector.deleteItemStat')}
            onRemove={() => {
              const stats = itemStats.filter((_, candidateIndex) => candidateIndex !== index);
              onChange({ ...itemDefinition, stats });
              void onPatch(itemDefinition.id, { stats });
            }}
          />
        </div>
      ))}
    </div>
  );
}
