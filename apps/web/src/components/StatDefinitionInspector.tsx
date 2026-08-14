import type { StatDefinition } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';

export function StatDefinitionInspector({
  statDefinition,
  categorySuggestions = [],
  onChange,
  onPatch,
}: {
  statDefinition: StatDefinition;
  categorySuggestions?: string[];
  onChange: (next: StatDefinition) => void;
  onPatch: (
    id: string,
    patch: { name?: string; category?: string; imageUrl?: string; changePerHour?: number },
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <h3>{t('inspector.stat')}</h3>
      <label>
        {t('inspector.name')}
        <input
          data-comment-field="name"
          value={statDefinition.name}
          onChange={(event) => onChange({ ...statDefinition, name: event.target.value })}
          onBlur={(event) => void onPatch(statDefinition.id, { name: event.target.value })}
        />
      </label>
      <CategoryField
        category={statDefinition.category}
        suggestions={categorySuggestions}
        onChange={(category) => onChange({ ...statDefinition, category })}
        onBlur={(category) => void onPatch(statDefinition.id, { category })}
      />
      <ImageUrlField
        label={t('inspector.pictogramUrl')}
        imageUrl={statDefinition.imageUrl}
        onChange={(imageUrl) => onChange({ ...statDefinition, imageUrl })}
        onBlur={(imageUrl) => void onPatch(statDefinition.id, { imageUrl })}
      />
      <label>
        {t('inspector.changePerHour')}
        <input
          type="number"
          step="any"
          value={statDefinition.changePerHour ?? 0}
          onChange={(event) =>
            onChange({ ...statDefinition, changePerHour: Number(event.target.value) })
          }
          onBlur={(event) =>
            void onPatch(statDefinition.id, { changePerHour: Number(event.target.value) })
          }
        />
      </label>
      <p className="hint">{t('inspector.statHelp')}</p>
    </div>
  );
}
