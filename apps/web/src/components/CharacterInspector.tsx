import type { Character } from '@paralleax/shared';

export function CharacterInspector({
  character,
  onChange,
  onPatch,
}: {
  character: Character;
  onChange: (patch: Partial<Character>) => void;
  onPatch: (id: string, patch: Partial<Pick<Character, 'name' | 'description'>>) => Promise<void>;
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
