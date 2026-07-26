import type { StatDefinition } from '@paralleax/shared';

export function StatDefinitionInspector({
  statDefinition,
  onChange,
  onPatch,
}: {
  statDefinition: StatDefinition;
  onChange: (next: StatDefinition) => void;
  onPatch: (id: string, patch: { name?: string }) => Promise<void>;
}) {
  return (
    <div>
      <h3>Stat</h3>
      <label>
        Name
        <input
          value={statDefinition.name}
          onChange={(event) => onChange({ ...statDefinition, name: event.target.value })}
          onBlur={(event) => void onPatch(statDefinition.id, { name: event.target.value })}
        />
      </label>
      <p className="hint">
        Add this reusable stat to any character, then set that character&apos;s initial value.
      </p>
    </div>
  );
}
