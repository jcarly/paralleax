import { updateInteractionInStory, type Interaction, type Story } from '@paralleax/shared';
import { RichTextEditor } from './RichTextEditor';

export function InteractionInspector({
  story,
  interaction,
  onChange,
  onPatch,
  onDelete,
}: {
  story: Story;
  interaction: Interaction;
  onChange: (story: Story) => void;
  onPatch: (id: string, patch: Partial<Interaction>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const stats = (story.characters ?? []).flatMap((character) =>
    (character.stats ?? []).map((stat) => ({
      ...stat,
      label: `${character.name} — ${
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        'Unknown stat'
      }`,
    })),
  );
  const items = (story.characters ?? []).flatMap((character) =>
    (character.items ?? []).map((item) => {
      const definition = story.itemDefinitions?.find(({ id }) => id === item.itemDefinitionId);
      const sameDefinitionItems = (character.items ?? []).filter(
        ({ itemDefinitionId }) => itemDefinitionId === item.itemDefinitionId,
      );
      const copyNumber =
        sameDefinitionItems.length > 1
          ? ` #${sameDefinitionItems.findIndex(({ id }) => id === item.id) + 1}`
          : '';
      return {
        ...item,
        label: `${character.name} — ${definition?.name ?? 'Unknown item'}${copyNumber}`,
      };
    }),
  );
  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  return (
    <div>
      <label>
        Title
        <input
          value={interaction.title}
          onChange={(e) => updateLocalInteraction({ title: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { title: e.target.value })}
        />
      </label>
      <RichTextEditor
        value={interaction.body}
        onChange={(body) => updateLocalInteraction({ body })}
        onBlur={(body) => void onPatch(interaction.id, { body })}
      />
      <label>
        Duration (minutes)
        <input
          type="number"
          min="0"
          step="1"
          value={interaction.durationMinutes ?? 0}
          onChange={(event) => {
            const durationMinutes = Math.max(0, Math.trunc(Number(event.target.value) || 0));
            updateLocalInteraction({ durationMinutes });
          }}
          onBlur={(event) => {
            const durationMinutes = Math.max(0, Math.trunc(Number(event.target.value) || 0));
            void onPatch(interaction.id, { durationMinutes });
          }}
        />
      </label>
      <label>
        Location
        <select
          value={interaction.locationId ?? ''}
          onChange={(event) => {
            const locationId = event.target.value || null;
            updateLocalInteraction({ locationId });
            void onPatch(interaction.id, { locationId });
          }}
        >
          <option value="">No location change</option>
          {(story.locations ?? []).map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Characters present</legend>
        {(story.characters?.length ?? 0) === 0 ? (
          <p className="hint">No characters yet.</p>
        ) : (
          (story.characters ?? []).map((character) => (
            <label key={character.id}>
              <input
                type="checkbox"
                checked={(interaction.characterIds ?? []).includes(character.id)}
                onChange={(event) => {
                  const characterIds = event.target.checked
                    ? [...(interaction.characterIds ?? []), character.id]
                    : (interaction.characterIds ?? []).filter((id) => id !== character.id);
                  updateLocalInteraction({ characterIds });
                  void onPatch(interaction.id, { characterIds });
                }}
              />
              {character.name}
            </label>
          ))
        )}
      </fieldset>
      <div className="inspector-section-header">
        <h3>Stat effects</h3>
        <button
          className="secondary"
          type="button"
          disabled={stats.length === 0}
          onClick={() => {
            const candidate = stats.find(
              (stat) => !(interaction.statEffects ?? []).some(({ statId }) => statId === stat.id),
            );
            if (!candidate) return;
            const statEffects = [
              ...(interaction.statEffects ?? []),
              { statId: candidate.id, operation: 'add' as const, value: 1 },
            ];
            updateLocalInteraction({ statEffects });
            void onPatch(interaction.id, { statEffects });
          }}
        >
          Add effect
        </button>
      </div>
      {(interaction.statEffects ?? []).map((effect, index) => (
        <div className="stat-effect-row" key={effect.statId}>
          <select
            aria-label="Affected stat"
            value={effect.statId}
            onChange={(event) => {
              const statEffects = [...(interaction.statEffects ?? [])];
              statEffects[index] = { ...effect, statId: event.target.value };
              updateLocalInteraction({ statEffects });
              void onPatch(interaction.id, { statEffects });
            }}
          >
            {stats.map((stat) => (
              <option
                disabled={(interaction.statEffects ?? []).some(
                  (item, itemIndex) => itemIndex !== index && item.statId === stat.id,
                )}
                key={stat.id}
                value={stat.id}
              >
                {stat.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Stat effect operation"
            value={effect.operation}
            onChange={(event) => {
              const statEffects = [...(interaction.statEffects ?? [])];
              statEffects[index] = {
                ...effect,
                operation: event.target.value as 'add' | 'set',
              };
              updateLocalInteraction({ statEffects });
              void onPatch(interaction.id, { statEffects });
            }}
          >
            <option value="add">add</option>
            <option value="set">set to</option>
          </select>
          <input
            aria-label="Stat effect value"
            type="number"
            value={effect.value}
            onChange={(event) => {
              const statEffects = [...(interaction.statEffects ?? [])];
              statEffects[index] = { ...effect, value: Number(event.target.value) };
              updateLocalInteraction({ statEffects });
            }}
            onBlur={(event) => {
              const statEffects = [...(interaction.statEffects ?? [])];
              statEffects[index] = { ...effect, value: Number(event.target.value) };
              void onPatch(interaction.id, { statEffects });
            }}
          />
          <button
            aria-label="Delete stat effect"
            className="ghost danger"
            type="button"
            onClick={() => {
              const statEffects = (interaction.statEffects ?? []).filter(
                (_, itemIndex) => itemIndex !== index,
              );
              updateLocalInteraction({ statEffects });
              void onPatch(interaction.id, { statEffects });
            }}
          >
            x
          </button>
        </div>
      ))}
      <div className="inspector-section-header">
        <h3>Item effects</h3>
        <button
          className="secondary"
          type="button"
          disabled={items.length === 0}
          onClick={() => {
            const candidate = items.find(
              (item) => !(interaction.itemEffects ?? []).some(({ itemId }) => itemId === item.id),
            );
            if (!candidate) return;
            const itemEffects = [
              ...(interaction.itemEffects ?? []),
              { itemId: candidate.id, operation: 'obtain' as const },
            ];
            updateLocalInteraction({ itemEffects });
            void onPatch(interaction.id, { itemEffects });
          }}
        >
          Add item effect
        </button>
      </div>
      {(interaction.itemEffects ?? []).map((effect, index) => (
        <div className="stat-effect-row" key={effect.itemId}>
          <select
            aria-label="Affected item"
            value={effect.itemId}
            onChange={(event) => {
              const itemEffects = [...(interaction.itemEffects ?? [])];
              itemEffects[index] = { ...effect, itemId: event.target.value };
              updateLocalInteraction({ itemEffects });
              void onPatch(interaction.id, { itemEffects });
            }}
          >
            {items.map((item) => (
              <option
                disabled={(interaction.itemEffects ?? []).some(
                  (candidate, itemIndex) => itemIndex !== index && candidate.itemId === item.id,
                )}
                key={item.id}
                value={item.id}
              >
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Item effect operation"
            value={effect.operation}
            onChange={(event) => {
              const itemEffects = [...(interaction.itemEffects ?? [])];
              itemEffects[index] = {
                ...effect,
                operation: event.target.value as 'obtain' | 'lose',
              };
              updateLocalInteraction({ itemEffects });
              void onPatch(interaction.id, { itemEffects });
            }}
          >
            <option value="obtain">obtain</option>
            <option value="lose">lose</option>
          </select>
          <button
            aria-label="Delete item effect"
            className="ghost danger"
            type="button"
            onClick={() => {
              const itemEffects = (interaction.itemEffects ?? []).filter(
                (_, itemIndex) => itemIndex !== index,
              );
              updateLocalInteraction({ itemEffects });
              void onPatch(interaction.id, { itemEffects });
            }}
          >
            x
          </button>
        </div>
      ))}
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        Delete interaction
      </button>
    </div>
  );
}
