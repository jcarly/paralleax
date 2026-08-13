import { updateInteractionInStory, type Interaction, type Story } from '@paralleax/shared';
import { useId } from 'react';
import { RichTextEditor } from './RichTextEditor';

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase();
}

interface SearchableTargetOption {
  id: string;
  label: string;
  disabled?: boolean;
}

function SearchableTargetField({
  ariaLabel,
  value,
  options,
  onSelect,
}: {
  ariaLabel: string;
  value: string;
  options: SearchableTargetOption[];
  onSelect: (id: string) => void;
}) {
  const datalistId = `effect-target-${useId().replace(/:/g, '')}`;
  const selectedLabel = options.find((option) => option.id === value)?.label ?? '';

  return (
    <label>
      Target
      <input
        aria-label={ariaLabel}
        autoComplete="off"
        defaultValue={selectedLabel}
        key={`${value}:${selectedLabel}`}
        list={datalistId}
        onChange={(event) => {
          const nextQuery = event.target.value;
          const option = options.find(
            (candidate) => candidate.label === nextQuery && !candidate.disabled,
          );
          if (option) onSelect(option.id);
        }}
        onBlur={(event) => {
          if (
            !options.some(
              (option) => option.label === event.currentTarget.value && !option.disabled,
            )
          ) {
            event.currentTarget.value = selectedLabel;
          }
        }}
      />
      <datalist id={datalistId}>
        {options.map((option) => (
          <option disabled={option.disabled} key={option.id} value={option.label} />
        ))}
      </datalist>
    </label>
  );
}

export function InteractionInspector({
  story,
  interaction,
  onChange,
  onPatch,
  onDelete,
  onSelectInteraction,
}: {
  story: Story;
  interaction: Interaction;
  onChange: (story: Story) => void;
  onPatch: (id: string, patch: Partial<Interaction>) => Promise<void>;
  onDelete: () => Promise<void>;
  onSelectInteraction?: (interactionId: string) => void;
}) {
  const characters = story.characters ?? [];
  const outgoingInteractions = story.interactions.filter((candidate) =>
    candidate.triggers.some((trigger) => trigger.inputInteractionIds.includes(interaction.id)),
  );
  const stats = characters.flatMap((character) =>
    (character.stats ?? []).map((stat) => {
      const statName =
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        'Unknown stat';
      return {
        ...stat,
        characterId: character.id,
        characterName: character.name,
        statName,
        label: `${character.name} — ${statName}`,
      };
    }),
  );
  const statEffectTargetOptions = characters
    .filter((character) => stats.some((stat) => stat.characterId === character.id))
    .map((character) => ({ id: character.id, label: character.name }));
  const itemOwners = [...characters, ...(story.locations ?? [])];
  const items = itemOwners.flatMap((owner) =>
    (owner.items ?? []).map((item) => {
      const definition = story.itemDefinitions?.find(({ id }) => id === item.itemDefinitionId);
      const sameDefinitionItems = (owner.items ?? []).filter(
        ({ itemDefinitionId }) => itemDefinitionId === item.itemDefinitionId,
      );
      const copyNumber =
        sameDefinitionItems.length > 1
          ? ` #${sameDefinitionItems.findIndex(({ id }) => id === item.id) + 1}`
          : '';
      return {
        ...item,
        label: `${owner.name} — ${definition?.name ?? 'Unknown item'}${copyNumber}`,
      };
    }),
  );
  const itemStats = items.flatMap((item) => {
    const definition = story.itemDefinitions?.find(({ id }) => id === item.itemDefinitionId);
    return (definition?.stats ?? []).map((stat) => {
      const statName =
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        'Unknown stat';
      return {
        itemId: item.id,
        statDefinitionId: stat.statDefinitionId,
        statName,
        label: `${item.label} — ${statName}`,
      };
    });
  });
  const itemStatEffects = interaction.itemStatEffects ?? [];
  const itemDefinitions = story.itemDefinitions ?? [];
  const availableItemStat = itemStats.find(
    (itemStat) =>
      !itemStatEffects.some(
        ({ itemId, statDefinitionId }) =>
          itemId === itemStat.itemId && statDefinitionId === itemStat.statDefinitionId,
      ),
  );
  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  return (
    <div className="interaction-inspector">
      <section className="interaction-inspector-content">
        <h3>Content</h3>
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
          conditionalTargets={outgoingInteractions}
          onConditionalTargetClick={onSelectInteraction}
        />
      </section>
      <details className="inspector-accordion" open>
        <summary>
          <span>Context and timing</span>
          <small>{interaction.characterIds?.length ?? 0} present</small>
        </summary>
        <div className="inspector-accordion-content">
          <div className="interaction-timing-block">
            <strong>Interaction duration</strong>
            <p className="hint">Advance the story clock when this interaction is selected.</p>
            <label>
              Duration
              <span className="interaction-duration-input">
                <input
                  aria-label="Duration (minutes)"
                  type="number"
                  min="0"
                  step="1"
                  value={interaction.durationMinutes ?? 0}
                  onChange={(event) => {
                    const durationMinutes = Math.max(
                      0,
                      Math.trunc(Number(event.target.value) || 0),
                    );
                    updateLocalInteraction({ durationMinutes });
                  }}
                  onBlur={(event) => {
                    const durationMinutes = Math.max(
                      0,
                      Math.trunc(Number(event.target.value) || 0),
                    );
                    void onPatch(interaction.id, { durationMinutes });
                  }}
                />
                <small>minutes</small>
              </span>
            </label>
          </div>
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
          <fieldset className="character-presence-fieldset">
            <legend>Characters present</legend>
            {(story.characters?.length ?? 0) === 0 ? (
              <p className="hint">No characters yet.</p>
            ) : (
              (story.characters ?? []).map((character) => (
                <label className="character-presence-option" key={character.id}>
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
                  {character.imageUrl ? (
                    <img className="character-presence-avatar" src={character.imageUrl} alt="" />
                  ) : (
                    <span className="character-presence-avatar" aria-hidden="true">
                      {getInitials(character.name)}
                    </span>
                  )}
                  <span>{character.name}</span>
                </label>
              ))
            )}
          </fieldset>
        </div>
      </details>
      <details className="inspector-accordion" open>
        <summary>
          <span>Stat effects</span>
          <small>{interaction.statEffects?.length ?? 0}</small>
        </summary>
        <div className="inspector-accordion-content">
          <div className="inspector-effect-actions">
            <button
              className="secondary"
              type="button"
              disabled={stats.length === 0}
              onClick={() => {
                const candidate = stats.find(
                  (stat) =>
                    !(interaction.statEffects ?? []).some(({ statId }) => statId === stat.id),
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
          {(interaction.statEffects ?? []).map((effect, index) => {
            const selectedStat = stats.find((stat) => stat.id === effect.statId);
            const targetStats = stats.filter(
              (stat) => stat.characterId === selectedStat?.characterId,
            );
            const targetOptions = statEffectTargetOptions.map((option) => ({
              ...option,
              disabled: !stats.some(
                (stat) =>
                  stat.characterId === option.id &&
                  !(interaction.statEffects ?? []).some(
                    (candidate, candidateIndex) =>
                      candidateIndex !== index && candidate.statId === stat.id,
                  ),
              ),
            }));
            return (
              <div className="interaction-effect-card" key={effect.statId}>
                <strong className="interaction-effect-title">Stat change {index + 1}</strong>
                <button
                  aria-label="Delete stat effect"
                  className="ghost danger interaction-effect-remove"
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
                <div className="interaction-effect-fields">
                  <SearchableTargetField
                    ariaLabel="Stat effect target"
                    value={selectedStat?.characterId ?? ''}
                    options={targetOptions}
                    onSelect={(characterId) => {
                      const usedByAnotherEffect = (statId: string) =>
                        (interaction.statEffects ?? []).some(
                          (candidate, candidateIndex) =>
                            candidateIndex !== index && candidate.statId === statId,
                        );
                      const candidateStats = stats.filter(
                        (stat) => stat.characterId === characterId,
                      );
                      const candidate =
                        candidateStats.find(
                          (stat) =>
                            stat.statDefinitionId === selectedStat?.statDefinitionId &&
                            !usedByAnotherEffect(stat.id),
                        ) ?? candidateStats.find((stat) => !usedByAnotherEffect(stat.id));
                      if (!candidate) return;
                      const statEffects = [...(interaction.statEffects ?? [])];
                      statEffects[index] = { ...effect, statId: candidate.id };
                      updateLocalInteraction({ statEffects });
                      void onPatch(interaction.id, { statEffects });
                    }}
                  />
                  <label>
                    Stat
                    <select
                      aria-label="Affected stat"
                      value={selectedStat?.statDefinitionId ?? ''}
                      onChange={(event) => {
                        const candidate = targetStats.find(
                          (stat) => stat.statDefinitionId === event.target.value,
                        );
                        if (!candidate) return;
                        const statEffects = [...(interaction.statEffects ?? [])];
                        statEffects[index] = { ...effect, statId: candidate.id };
                        updateLocalInteraction({ statEffects });
                        void onPatch(interaction.id, { statEffects });
                      }}
                    >
                      {targetStats.map((stat) => (
                        <option
                          disabled={(interaction.statEffects ?? []).some(
                            (candidate, candidateIndex) =>
                              candidateIndex !== index && candidate.statId === stat.id,
                          )}
                          key={stat.id}
                          value={stat.statDefinitionId}
                        >
                          {stat.statName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Operation
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
                  </label>
                  <label>
                    Value
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
                  </label>
                </div>
              </div>
            );
          })}
          {(interaction.statEffects?.length ?? 0) === 0 ? (
            <p className="inspector-empty-effect">No stat effects yet.</p>
          ) : null}
        </div>
      </details>
      <details className="inspector-accordion" open>
        <summary>
          <span>Item effects</span>
          <small>{interaction.itemEffects?.length ?? 0}</small>
        </summary>
        <div className="inspector-accordion-content">
          <div className="inspector-effect-actions">
            <button
              className="secondary"
              type="button"
              disabled={itemDefinitions.length === 0 || characters.length === 0}
              onClick={() => {
                const character = characters[0];
                const candidate = itemDefinitions.find(
                  (definition) =>
                    !(interaction.itemEffects ?? []).some(
                      ({ itemDefinitionId, characterId }) =>
                        itemDefinitionId === definition.id && characterId === character?.id,
                    ),
                );
                if (!candidate || !character) return;
                const itemEffects = [
                  ...(interaction.itemEffects ?? []),
                  {
                    itemDefinitionId: candidate.id,
                    characterId: character.id,
                    operation: 'obtain' as const,
                  },
                ];
                updateLocalInteraction({ itemEffects });
                void onPatch(interaction.id, { itemEffects });
              }}
            >
              Add item effect
            </button>
          </div>
          {(interaction.itemEffects ?? []).map((effect, index) => (
            <div
              className="interaction-effect-card"
              key={`${effect.characterId ?? ''}:${effect.itemDefinitionId ?? effect.itemId ?? index}`}
            >
              <strong className="interaction-effect-title">Inventory change {index + 1}</strong>
              <button
                aria-label="Delete item effect"
                className="ghost danger interaction-effect-remove"
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
              <div className="interaction-effect-fields">
                <SearchableTargetField
                  ariaLabel="Item effect target"
                  value={effect.characterId ?? ''}
                  options={characters.map((character) => ({
                    id: character.id,
                    label: character.name,
                    disabled: (interaction.itemEffects ?? []).some(
                      (candidate, candidateIndex) =>
                        candidateIndex !== index &&
                        candidate.itemDefinitionId === effect.itemDefinitionId &&
                        candidate.characterId === character.id,
                    ),
                  }))}
                  onSelect={(characterId) => {
                    const itemEffects = [...(interaction.itemEffects ?? [])];
                    itemEffects[index] = { ...effect, characterId };
                    updateLocalInteraction({ itemEffects });
                    void onPatch(interaction.id, { itemEffects });
                  }}
                />
                <label>
                  Item
                  <select
                    aria-label="Affected item"
                    value={effect.itemDefinitionId ?? ''}
                    onChange={(event) => {
                      const itemEffects = [...(interaction.itemEffects ?? [])];
                      itemEffects[index] = {
                        itemDefinitionId: event.target.value,
                        characterId: effect.characterId,
                        operation: effect.operation,
                      };
                      updateLocalInteraction({ itemEffects });
                      void onPatch(interaction.id, { itemEffects });
                    }}
                  >
                    {effect.itemId ? <option value="">Legacy assigned instance</option> : null}
                    {itemDefinitions.map((definition) => (
                      <option
                        disabled={(interaction.itemEffects ?? []).some(
                          (candidate, itemIndex) =>
                            itemIndex !== index &&
                            candidate.itemDefinitionId === definition.id &&
                            candidate.characterId === effect.characterId,
                        )}
                        key={definition.id}
                        value={definition.id}
                      >
                        {definition.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Operation
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
                </label>
              </div>
            </div>
          ))}
          {(interaction.itemEffects?.length ?? 0) === 0 ? (
            <p className="inspector-empty-effect">No item effects yet.</p>
          ) : null}
        </div>
      </details>
      <details className="inspector-accordion" open>
        <summary>
          <span>Item stat effects</span>
          <small>{itemStatEffects.length}</small>
        </summary>
        <div className="inspector-accordion-content">
          <div className="inspector-effect-actions">
            <button
              className="secondary"
              type="button"
              disabled={!availableItemStat}
              onClick={() => {
                const nextEffects = [
                  ...itemStatEffects,
                  {
                    itemId: availableItemStat!.itemId,
                    statDefinitionId: availableItemStat!.statDefinitionId,
                    operation: 'add' as const,
                    value: 1,
                  },
                ];
                updateLocalInteraction({ itemStatEffects: nextEffects });
                void onPatch(interaction.id, { itemStatEffects: nextEffects });
              }}
            >
              Add item stat effect
            </button>
          </div>
          {itemStatEffects.map((effect, index) => (
            <div
              className="interaction-effect-card"
              key={`${effect.itemId}:${effect.statDefinitionId}`}
            >
              <strong className="interaction-effect-title">Item stat change {index + 1}</strong>
              <button
                aria-label="Delete item stat effect"
                className="ghost danger interaction-effect-remove"
                type="button"
                onClick={() => {
                  const nextEffects = itemStatEffects.filter(
                    (_, candidateIndex) => candidateIndex !== index,
                  );
                  updateLocalInteraction({ itemStatEffects: nextEffects });
                  void onPatch(interaction.id, { itemStatEffects: nextEffects });
                }}
              >
                x
              </button>
              <div className="interaction-effect-fields">
                <SearchableTargetField
                  ariaLabel="Item stat effect target"
                  value={effect.itemId}
                  options={items.map((item) => ({
                    id: item.id,
                    label: item.label,
                    disabled: !itemStats.some(
                      (itemStat) =>
                        itemStat.itemId === item.id &&
                        !itemStatEffects.some(
                          (candidate, candidateIndex) =>
                            candidateIndex !== index &&
                            candidate.itemId === itemStat.itemId &&
                            candidate.statDefinitionId === itemStat.statDefinitionId,
                        ),
                    ),
                  }))}
                  onSelect={(itemId) => {
                    const usedByAnotherEffect = (statDefinitionId: string) =>
                      itemStatEffects.some(
                        (candidate, candidateIndex) =>
                          candidateIndex !== index &&
                          candidate.itemId === itemId &&
                          candidate.statDefinitionId === statDefinitionId,
                      );
                    const candidateStats = itemStats.filter(
                      (itemStat) => itemStat.itemId === itemId,
                    );
                    const candidate =
                      candidateStats.find(
                        (itemStat) =>
                          itemStat.statDefinitionId === effect.statDefinitionId &&
                          !usedByAnotherEffect(itemStat.statDefinitionId),
                      ) ??
                      candidateStats.find(
                        (itemStat) => !usedByAnotherEffect(itemStat.statDefinitionId),
                      );
                    if (!candidate) return;
                    const nextEffects = [...itemStatEffects];
                    nextEffects[index] = {
                      ...effect,
                      itemId,
                      statDefinitionId: candidate.statDefinitionId,
                    };
                    updateLocalInteraction({ itemStatEffects: nextEffects });
                    void onPatch(interaction.id, { itemStatEffects: nextEffects });
                  }}
                />
                <label>
                  Stat
                  <select
                    aria-label="Affected item stat"
                    value={effect.statDefinitionId}
                    onChange={(event) => {
                      const nextEffects = [...itemStatEffects];
                      nextEffects[index] = {
                        ...effect,
                        statDefinitionId: event.target.value,
                      };
                      updateLocalInteraction({ itemStatEffects: nextEffects });
                      void onPatch(interaction.id, { itemStatEffects: nextEffects });
                    }}
                  >
                    {itemStats
                      .filter((itemStat) => itemStat.itemId === effect.itemId)
                      .map((itemStat) => (
                        <option
                          key={itemStat.statDefinitionId}
                          value={itemStat.statDefinitionId}
                          disabled={itemStatEffects.some(
                            (candidate, candidateIndex) =>
                              candidateIndex !== index &&
                              candidate.itemId === effect.itemId &&
                              candidate.statDefinitionId === itemStat.statDefinitionId,
                          )}
                        >
                          {itemStat.statName}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Operation
                  <select
                    aria-label="Item stat effect operation"
                    value={effect.operation}
                    onChange={(event) => {
                      const nextEffects = [...itemStatEffects];
                      nextEffects[index] = {
                        ...effect,
                        operation: event.target.value as 'add' | 'set',
                      };
                      updateLocalInteraction({ itemStatEffects: nextEffects });
                      void onPatch(interaction.id, { itemStatEffects: nextEffects });
                    }}
                  >
                    <option value="add">add</option>
                    <option value="set">set to</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    aria-label="Item stat effect value"
                    type="number"
                    value={effect.value}
                    onChange={(event) => {
                      const nextEffects = [...itemStatEffects];
                      nextEffects[index] = {
                        ...effect,
                        value: Number(event.target.value),
                      };
                      updateLocalInteraction({ itemStatEffects: nextEffects });
                    }}
                    onBlur={(event) => {
                      const nextEffects = [...itemStatEffects];
                      nextEffects[index] = {
                        ...effect,
                        value: Number(event.target.value),
                      };
                      void onPatch(interaction.id, { itemStatEffects: nextEffects });
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
          {itemStatEffects.length === 0 ? (
            <p className="inspector-empty-effect">No item stat effects yet.</p>
          ) : null}
        </div>
      </details>
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        Delete interaction
      </button>
    </div>
  );
}
