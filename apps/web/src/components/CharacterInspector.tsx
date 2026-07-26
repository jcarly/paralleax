import type { Character } from '@paralleax/shared';

export function CharacterInspector({
  character,
  onChange,
  onPatch,
  onCreateStat,
  onPatchStat,
}: {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
  onPatch: (id: string, patch: Partial<Pick<Character, 'name' | 'description'>>) => Promise<void>;
  onCreateStat: (characterId: string) => Promise<void>;
  onPatchStat: (
    characterId: string,
    statId: string,
    patch: { name?: string; initialValue?: number },
  ) => Promise<void>;
}) {
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
        <button className="secondary" type="button" onClick={() => void onCreateStat(character.id)}>
          Add stat
        </button>
      </div>
      {(character.stats ?? []).map((stat) => (
        <div className="stat-row" key={stat.id}>
          <label>
            Stat name
            <input
              value={stat.name}
              onChange={(event) =>
                onChange({
                  stats: (character.stats ?? []).map((item) =>
                    item.id === stat.id ? { ...item, name: event.target.value } : item,
                  ),
                })
              }
              onBlur={(event) =>
                void onPatchStat(character.id, stat.id, { name: event.target.value })
              }
            />
          </label>
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
