import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Character,
  ItemDefinition,
  MoveItemInstanceInput,
  StatDefinition,
} from '@paralleax/shared';
import { CategoryField } from './CategoryField';
import { ImageUrlField } from './ImageUrlField';
import { ItemInstanceTree } from './ItemInstanceTree';
import { RemoveRowButton } from './RemoveRowButton';

export function CharacterInspector({
  character,
  categorySuggestions = [],
  onChange,
  onPatch,
  onCreateStat,
  onPatchStat,
  onDeleteStat,
  statDefinitions,
  itemDefinitions,
  onCreateItem,
  onDeleteItem,
  onMoveItem,
}: {
  character: Character;
  categorySuggestions?: string[];
  statDefinitions: StatDefinition[];
  itemDefinitions: ItemDefinition[];
  onChange: (patch: Partial<Character>) => void;
  onPatch: (
    id: string,
    patch: Partial<
      Pick<Character, 'name' | 'description' | 'category' | 'imageUrl' | 'isPlayable'>
    >,
  ) => Promise<void>;
  onCreateStat: (characterId: string, statDefinitionId: string) => Promise<void>;
  onPatchStat: (
    characterId: string,
    statId: string,
    patch: { initialValue?: number },
  ) => Promise<void>;
  onDeleteStat: (characterId: string, statId: string) => Promise<void>;
  onCreateItem: (characterId: string, itemDefinitionId: string) => Promise<void>;
  onDeleteItem: (characterId: string, itemId: string) => Promise<void>;
  onMoveItem: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const availableDefinitions = statDefinitions.filter(
    (definition) =>
      !(character.stats ?? []).some(({ statDefinitionId }) => statDefinitionId === definition.id),
  );
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');
  const [selectedItemDefinitionId, setSelectedItemDefinitionId] = useState('');
  const definitionId = availableDefinitions.some(({ id }) => id === selectedDefinitionId)
    ? selectedDefinitionId
    : (availableDefinitions[0]?.id ?? '');
  const itemDefinitionId = itemDefinitions.some(({ id }) => id === selectedItemDefinitionId)
    ? selectedItemDefinitionId
    : (itemDefinitions[0]?.id ?? '');

  return (
    <div>
      <h3>{t('inspector.character')}</h3>
      <label>
        {t('inspector.name')}
        <input
          data-comment-field="name"
          value={character.name}
          onChange={(event) => onChange({ name: event.target.value })}
          onBlur={(event) => void onPatch(character.id, { name: event.target.value })}
        />
      </label>
      <CategoryField
        category={character.category}
        suggestions={categorySuggestions}
        onChange={(category) => onChange({ category })}
        onBlur={(category) => void onPatch(character.id, { category })}
      />
      <ImageUrlField
        imageUrl={character.imageUrl}
        onChange={(imageUrl) => onChange({ imageUrl })}
        onBlur={(imageUrl) => void onPatch(character.id, { imageUrl })}
      />
      <label>
        <input
          type="checkbox"
          checked={character.isPlayable ?? false}
          onChange={(event) => {
            const isPlayable = event.target.checked;
            onChange({ isPlayable });
            void onPatch(character.id, { isPlayable });
          }}
        />
        {t('inspector.playableCharacter')}
      </label>
      <div className="inspector-section-header">
        <h3>{t('inspector.stats')}</h3>
      </div>
      {availableDefinitions.length > 0 ? (
        <div className="stat-assignment">
          <select
            aria-label={t('inspector.statToAdd')}
            value={definitionId}
            onChange={(event) => setSelectedDefinitionId(event.target.value)}
          >
            {availableDefinitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            type="button"
            aria-label={t('inspector.addStat')}
            onClick={() => void onCreateStat(character.id, definitionId)}
          >
            {t('inspector.add')}
          </button>
        </div>
      ) : (
        <p className="hint">
          {statDefinitions.length === 0
            ? t('inspector.createStatFirst')
            : t('inspector.allStatsAssigned')}
        </p>
      )}
      {(character.stats ?? []).map((stat) => (
        <div className="stat-row" key={stat.id}>
          <span className="stat-name">
            {statDefinitions.find(({ id }) => id === stat.statDefinitionId)?.imageUrl ? (
              <img
                className="context-picto"
                src={statDefinitions.find(({ id }) => id === stat.statDefinitionId)?.imageUrl}
                alt=""
              />
            ) : null}
            {statDefinitions.find(({ id }) => id === stat.statDefinitionId)?.name ??
              t('inspector.unknownStat')}
          </span>
          <label>
            {t('inspector.initialValue')}
            <input
              type="number"
              value={stat.initialValue}
              onChange={(event) =>
                onChange({
                  stats: (character.stats ?? []).map((item) =>
                    item.id === stat.id
                      ? { ...item, initialValue: Number(event.target.value) }
                      : item,
                  ),
                })
              }
              onBlur={(event) =>
                void onPatchStat(character.id, stat.id, {
                  initialValue: Number(event.target.value),
                })
              }
            />
          </label>
          <RemoveRowButton
            label={t('inspector.deleteCharacterStat')}
            onRemove={() => void onDeleteStat(character.id, stat.id)}
          />
        </div>
      ))}
      <div className="inspector-section-header">
        <h3>{t('inspector.items')}</h3>
      </div>
      {itemDefinitions.length > 0 ? (
        <div className="stat-assignment">
          <select
            aria-label={t('inspector.itemToAdd')}
            value={itemDefinitionId}
            onChange={(event) => setSelectedItemDefinitionId(event.target.value)}
          >
            {itemDefinitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
          <button
            className="secondary"
            type="button"
            aria-label={t('inspector.addItem')}
            onClick={() => void onCreateItem(character.id, itemDefinitionId)}
          >
            {t('inspector.add')}
          </button>
        </div>
      ) : (
        <p className="hint">{t('inspector.createItemFirst')}</p>
      )}
      {(character.items ?? []).length === 0 ? (
        <p className="hint">{t('inspector.noOwnedItems')}</p>
      ) : (
        <ItemInstanceTree
          items={character.items ?? []}
          itemDefinitions={itemDefinitions}
          statDefinitions={statDefinitions}
          rootPlacement={{ characterId: character.id }}
          onMove={onMoveItem}
          onDelete={(itemId) => onDeleteItem(character.id, itemId)}
        />
      )}
      <label>
        {t('inspector.description')}
        <textarea
          data-comment-field="description"
          rows={7}
          value={character.description}
          onChange={(event) => onChange({ description: event.target.value })}
          onBlur={(event) => void onPatch(character.id, { description: event.target.value })}
        />
      </label>
    </div>
  );
}
