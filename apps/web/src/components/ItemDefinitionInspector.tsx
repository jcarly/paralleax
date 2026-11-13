import { getStatValueType, type ItemDefinition, type StatDefinition } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import {
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { FieldHelpTooltip } from './FieldHelpTooltip';
import { RemoveRowButton } from './RemoveRowButton';
import { StatValueField } from './StatValueField';
import {
  InspectorCategoryField,
  InspectorDescriptionField,
  InspectorImageField,
  InspectorNameField,
} from './InspectorEntityFields';

export function ItemDefinitionInspector({
  itemDefinition,
  categorySuggestions = [],
  statDefinitions,
  onChange,
  onPatch,
  textCommentCounts,
  onOpenTextComments,
  semanticCommentCounts,
  onOpenSemanticComments,
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
} & InspectorTextCommentProps &
  InspectorSemanticCommentProps) {
  const { t } = useTranslation();
  const itemStats = itemDefinition.stats ?? [];
  return (
    <div>
      <div className="field-heading-with-help">
        <h3>{t('inspector.item')}</h3>
        <FieldHelpTooltip label={t('inspector.item')} help={t('inspector.itemInstanceHelp')} />
      </div>
      <InspectorImageField
        imageUrl={itemDefinition.imageUrl}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
        onChange={(imageUrl) => onChange({ ...itemDefinition, imageUrl })}
        onCommit={(imageUrl) => void onPatch(itemDefinition.id, { imageUrl })}
      />
      <InspectorNameField
        value={itemDefinition.name}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
        onChange={(name) => onChange({ ...itemDefinition, name })}
        onCommit={(name) => void onPatch(itemDefinition.id, { name })}
      />
      <InspectorCategoryField
        category={itemDefinition.category}
        suggestions={categorySuggestions}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
        onChange={(category) => onChange({ ...itemDefinition, category })}
        onCommit={(category) => void onPatch(itemDefinition.id, { category })}
      />
      <InspectorDescriptionField
        value={itemDefinition.description}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
        onChange={(description) => onChange({ ...itemDefinition, description })}
        onCommit={(description) => void onPatch(itemDefinition.id, { description })}
      />
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'stats' }}
        label={t('inspector.itemStats')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <div className="inspector-section-header editor-heading-row">
          <h3>{t('inspector.itemStats')}</h3>
          <button
            className="secondary"
            type="button"
            disabled={itemStats.length >= statDefinitions.length}
            onClick={() => {
              const candidate = statDefinitions.find(
                ({ id }) => !itemStats.some(({ statDefinitionId }) => statDefinitionId === id),
              )!;
              const valueType = getStatValueType(candidate);
              const stats = [
                ...itemStats,
                {
                  id: crypto.randomUUID(),
                  statDefinitionId: candidate.id,
                  initialValue: valueType === 'number' ? 0 : valueType === 'boolean' ? false : '',
                },
              ];
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
              className="form-control form-control--compact"
              aria-label={t('inspector.itemStat')}
              value={stat.statDefinitionId}
              onChange={(event) => {
                const definition = statDefinitions.find(({ id }) => id === event.target.value)!;
                const valueType = getStatValueType(definition);
                const stats = [...itemStats];
                stats[index] = {
                  ...stat,
                  statDefinitionId: definition.id,
                  initialValue: valueType === 'number' ? 0 : valueType === 'boolean' ? false : '',
                };
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
            <StatValueField
              ariaLabel={t('inspector.itemStatInitialValue')}
              value={stat.initialValue}
              valueType={getStatValueType(
                statDefinitions.find(({ id }) => id === stat.statDefinitionId) ?? {
                  id: stat.statDefinitionId,
                  name: stat.statDefinitionId,
                },
              )}
              onChange={(initialValue) => {
                const stats = [...itemStats];
                stats[index] = { ...stat, initialValue };
                onChange({ ...itemDefinition, stats });
              }}
              onBlur={(initialValue) => {
                const stats = [...itemStats];
                stats[index] = { ...stat, initialValue };
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
      </InspectorCommentSlot>
    </div>
  );
}
