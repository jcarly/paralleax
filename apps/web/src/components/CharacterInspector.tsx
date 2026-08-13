import { useState } from 'react';
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
      <h3>Character</h3>
      <label>
        Name
        <input
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
        Playable character
      </label>
      <div className="inspector-section-header">
        <h3>Stats</h3>
      </div>
      {availableDefinitions.length > 0 ? (
        <div className="stat-assignment">
          <select
            aria-label="Stat to add"
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
            aria-label="Add stat"
            onClick={() => void onCreateStat(character.id, definitionId)}
          >
            Add
          </button>
        </div>
      ) : (
        <p className="hint">
          {statDefinitions.length === 0
            ? 'Create a stat in the story context first.'
            : 'All available stats are already assigned.'}
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
            {statDefinitions.find(({ id }) => id === stat.statDefinitionId)?.name ?? 'Unknown stat'}
          </span>
          <label>
            Initial value
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
            label="Delete character stat"
            onRemove={() => void onDeleteStat(character.id, stat.id)}
          />
        </div>
      ))}
      <div className="inspector-section-header">
        <h3>Items</h3>
      </div>
      {itemDefinitions.length > 0 ? (
        <div className="stat-assignment">
          <select
            aria-label="Item to add"
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
            aria-label="Add item"
            onClick={() => void onCreateItem(character.id, itemDefinitionId)}
          >
            Add
          </button>
        </div>
      ) : (
        <p className="hint">Create an item in the story context first.</p>
      )}
      {(character.items ?? []).length === 0 ? (
        <p className="hint">No items owned yet.</p>
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
        Description
        <textarea
          rows={7}
          value={character.description}
          onChange={(event) => onChange({ description: event.target.value })}
          onBlur={(event) => void onPatch(character.id, { description: event.target.value })}
        />
      </label>
    </div>
  );
}
