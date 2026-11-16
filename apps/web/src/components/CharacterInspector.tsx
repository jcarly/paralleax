import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Character,
  ItemDefinition,
  MoveItemInstanceInput,
  StatDefinition,
  StatValue,
} from '@paralleax/shared';
import { getStatValueType } from '@paralleax/shared';
import {
  InspectorCommentField,
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { ItemInstanceTree } from './ItemInstanceTree';
import { RemoveRowButton } from './RemoveRowButton';
import { StatValueField } from './StatValueField';
import {
  InspectorCategoryField,
  InspectorImageField,
  InspectorNameField,
} from './InspectorEntityFields';

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
  textCommentCounts,
  onOpenTextComments,
  semanticCommentCounts,
  onOpenSemanticComments,
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
    patch: { initialValue?: StatValue },
  ) => Promise<void>;
  onDeleteStat: (characterId: string, statId: string) => Promise<void>;
  onCreateItem: (characterId: string, itemDefinitionId: string) => Promise<void>;
  onDeleteItem: (characterId: string, itemId: string) => Promise<void>;
  onMoveItem: (itemId: string, placement: MoveItemInstanceInput) => Promise<void>;
} & InspectorTextCommentProps &
  InspectorSemanticCommentProps) {
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
      <InspectorImageField
        imageUrl={character.imageUrl}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
        onChange={(imageUrl) => onChange({ imageUrl })}
        onCommit={(imageUrl) => void onPatch(character.id, { imageUrl })}
      />
      <InspectorNameField
        value={character.name}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
        onChange={(name) => onChange({ name })}
        onCommit={(name) => onPatch(character.id, { name })}
      />
      <InspectorCategoryField
        category={character.category}
        suggestions={categorySuggestions}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
        onChange={(category) => onChange({ category })}
        onCommit={(category) => void onPatch(character.id, { category })}
      />
      <InspectorCommentSlot
        slot={{ kind: 'field', field: 'isPlayable' }}
        label={t('inspector.playableCharacter')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
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
      </InspectorCommentSlot>
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'stats' }}
        label={t('inspector.stats')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <div className="inspector-section-header editor-heading-row">
          <h3>{t('inspector.stats')}</h3>
        </div>
        {availableDefinitions.length > 0 ? (
          <div className="stat-assignment">
            <select
              className="form-control form-control--compact"
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
            <label className="form-field form-field--compact">
              {t('inspector.initialValue')}
              <StatValueField
                ariaLabel={t('inspector.initialValue')}
                value={stat.initialValue}
                valueType={getStatValueType(
                  statDefinitions.find(({ id }) => id === stat.statDefinitionId) ?? {
                    id: stat.statDefinitionId,
                    name: stat.statDefinitionId,
                  },
                )}
                onChange={(initialValue) =>
                  onChange({
                    stats: (character.stats ?? []).map((item) =>
                      item.id === stat.id ? { ...item, initialValue } : item,
                    ),
                  })
                }
                onBlur={(initialValue) => void onPatchStat(character.id, stat.id, { initialValue })}
              />
            </label>
            <RemoveRowButton
              label={t('inspector.deleteCharacterStat')}
              onRemove={() => void onDeleteStat(character.id, stat.id)}
            />
          </div>
        ))}
      </InspectorCommentSlot>
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'items' }}
        label={t('inspector.items')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <div className="inspector-section-header editor-heading-row">
          <h3>{t('inspector.items')}</h3>
        </div>
        {itemDefinitions.length > 0 ? (
          <div className="stat-assignment">
            <select
              className="form-control form-control--compact"
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
      </InspectorCommentSlot>
      <InspectorCommentField
        field="description"
        label={t('inspector.description')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <label className="form-field form-field--compact">
          {t('inspector.description')}
          <textarea
            className="form-control form-control--compact form-control--multiline"
            data-comment-field="description"
            rows={7}
            value={character.description}
            onChange={(event) => onChange({ description: event.target.value })}
            onBlur={(event) => void onPatch(character.id, { description: event.target.value })}
          />
        </label>
      </InspectorCommentField>
    </div>
  );
}
