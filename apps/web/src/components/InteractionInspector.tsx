import { updateInteractionInStory, type Interaction, type Story } from '@paralleax/shared';

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
      <label>
        Content
        <textarea
          rows={7}
          value={interaction.body}
          onChange={(e) => updateLocalInteraction({ body: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { body: e.target.value })}
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
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        Delete interaction
      </button>
    </div>
  );
}
