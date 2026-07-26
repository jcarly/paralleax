import { useState } from 'react';
import type { Character, StatDefinition } from '@paralleax/shared';

export function CharacterInspector({
  character,
  onChange,
  onPatch,
  onCreateStat,
  onPatchStat,
  statDefinitions,
}: {
  character: Character;
  statDefinitions: StatDefinition[];
  onChange: (patch: Partial<Character>) => void;
  onPatch: (id: string, patch: Partial<Pick<Character, 'name' | 'description'>>) => Promise<void>;
  onCreateStat: (characterId: string, statDefinitionId: string) => Promise<void>;
  onPatchStat: (
    characterId: string,
    statId: string,
    patch: { initialValue?: number },
  ) => Promise<void>;
}) {
  const availableDefinitions = statDefinitions.filter(
    (definition) =>
      !(character.stats ?? []).some(
        ({ statDefinitionId }) => statDefinitionId === definition.id,
      ),
  );
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');
  const definitionId = availableDefinitions.some(({ id }) => id === selectedDefinitionId)
    ? selectedDefinitionId
    : (availableDefinitions[0]?.id ?? '');

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
        </div>
      ))}
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
