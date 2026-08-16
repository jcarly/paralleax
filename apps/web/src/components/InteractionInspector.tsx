import { updateInteractionInStory, type Interaction, type Story } from '@paralleax/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

type EffectType = 'characterStat' | 'inventory' | 'itemStat';

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
  const { t } = useTranslation();
  const datalistId = `effect-target-${useId().replace(/:/g, '')}`;
  const selectedLabel = options.find((option) => option.id === value)?.label ?? '';

  return (
    <label>
      {t('interactionInspector.target')}
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

function AddEffectControl({
  unavailableReasons,
  onAdd,
}: {
  unavailableReasons: Record<EffectType, string | undefined>;
  onAdd: (type: EffectType) => void;
}) {
  const { t } = useTranslation();
  const tooltipIdPrefix = useId();
  const [isChoosing, setIsChoosing] = useState(false);
  const effectTypes: EffectType[] = ['characterStat', 'inventory', 'itemStat'];

  if (!isChoosing) {
    return (
      <button
        className="secondary interaction-add-effect"
        type="button"
        onClick={() => setIsChoosing(true)}
      >
        {t('interactionInspector.addEffect')}
      </button>
    );
  }

  return (
    <div
      aria-label={t('interactionInspector.effectType')}
      className="interaction-effect-picker"
      role="group"
    >
      <div className="interaction-effect-picker-header">
        <span>{t('interactionInspector.chooseEffectType')}</span>
        <button
          aria-label={t('interactionInspector.cancelAddEffect')}
          className="ghost interaction-effect-picker-cancel"
          title={t('interactionInspector.cancelAddEffect')}
          type="button"
          onClick={() => setIsChoosing(false)}
        >
          ×
        </button>
      </div>
      <div className="interaction-effect-type-options">
        {effectTypes.map((type) => {
          const unavailableReason = unavailableReasons[type];
          const tooltipId = `${tooltipIdPrefix}-${type}`;
          return (
            <div
              aria-describedby={unavailableReason ? tooltipId : undefined}
              className="interaction-effect-type-option"
              key={type}
              tabIndex={unavailableReason ? 0 : undefined}
              title={unavailableReason}
            >
              <button
                aria-describedby={unavailableReason ? tooltipId : undefined}
                className="secondary"
                disabled={Boolean(unavailableReason)}
                title={unavailableReason}
                type="button"
                onClick={() => {
                  onAdd(type);
                  setIsChoosing(false);
                }}
              >
                {t(`interactionInspector.effectTypes.${type}`)}
              </button>
              {unavailableReason ? (
                <span className="interaction-effect-type-tooltip" id={tooltipId} role="tooltip">
                  {unavailableReason}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
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
  const { t } = useTranslation();
  const characters = story.characters ?? [];
  const outgoingInteractions = story.interactions.filter((candidate) =>
    candidate.triggers.some((trigger) => trigger.inputInteractionIds.includes(interaction.id)),
  );
  const stats = characters.flatMap((character) =>
    (character.stats ?? []).map((stat) => {
      const statName =
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        t('inspector.unknownStat');
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
        label: `${owner.name} — ${definition?.name ?? t('inspector.unknownItem')}${copyNumber}`,
      };
    }),
  );
  const itemStats = items.flatMap((item) => {
    const definition = story.itemDefinitions?.find(({ id }) => id === item.itemDefinitionId);
    return (definition?.stats ?? []).map((stat) => {
      const statName =
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        t('inspector.unknownStat');
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
  const availableStat = stats.find(
    (stat) => !(interaction.statEffects ?? []).some(({ statId }) => statId === stat.id),
  );
  const availableItemEffect = characters
    .flatMap((character) => itemDefinitions.map((definition) => ({ character, definition })))
    .find(
      ({ character, definition }) =>
        !(interaction.itemEffects ?? []).some(
          ({ itemDefinitionId, characterId }) =>
            itemDefinitionId === definition.id && characterId === character.id,
        ),
    );
  const availableItemStat = itemStats.find(
    (itemStat) =>
      !itemStatEffects.some(
        ({ itemId, statDefinitionId }) =>
          itemId === itemStat.itemId && statDefinitionId === itemStat.statDefinitionId,
      ),
  );
  const totalEffectCount =
    (interaction.statEffects?.length ?? 0) +
    (interaction.itemEffects?.length ?? 0) +
    itemStatEffects.length;
  const effectUnavailableReasons: Record<EffectType, string | undefined> = {
    characterStat: availableStat
      ? undefined
      : stats.length === 0
        ? t('interactionInspector.effectUnavailable.noCharacterStat')
        : t('interactionInspector.effectUnavailable.allCharacterStatsUsed'),
    inventory: availableItemEffect
      ? undefined
      : characters.length === 0
        ? t('interactionInspector.effectUnavailable.noCharacter')
        : itemDefinitions.length === 0
          ? t('interactionInspector.effectUnavailable.noItemDefinition')
          : t('interactionInspector.effectUnavailable.allInventoryEffectsUsed'),
    itemStat: availableItemStat
      ? undefined
      : itemStats.length === 0
        ? t('interactionInspector.effectUnavailable.noItemStat')
        : t('interactionInspector.effectUnavailable.allItemStatsUsed'),
  };
  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  function addEffect(type: EffectType) {
    if (type === 'characterStat' && availableStat) {
      const statEffects = [
        ...(interaction.statEffects ?? []),
        { statId: availableStat.id, operation: 'add' as const, value: 1 },
      ];
      updateLocalInteraction({ statEffects });
      void onPatch(interaction.id, { statEffects });
      return;
    }
    if (type === 'inventory' && availableItemEffect) {
      const itemEffects = [
        ...(interaction.itemEffects ?? []),
        {
          itemDefinitionId: availableItemEffect.definition.id,
          characterId: availableItemEffect.character.id,
          operation: 'obtain' as const,
        },
      ];
      updateLocalInteraction({ itemEffects });
      void onPatch(interaction.id, { itemEffects });
      return;
    }
    if (type === 'itemStat' && availableItemStat) {
      const nextEffects = [
        ...itemStatEffects,
        {
          itemId: availableItemStat.itemId,
          statDefinitionId: availableItemStat.statDefinitionId,
          operation: 'add' as const,
          value: 1,
        },
      ];
      updateLocalInteraction({ itemStatEffects: nextEffects });
      void onPatch(interaction.id, { itemStatEffects: nextEffects });
    }
  }

  return (
    <div className="interaction-inspector">
      <section className="interaction-inspector-content">
        <h3>{t('interactionInspector.content')}</h3>
        <label>
          {t('interactionInspector.title')}
          <input
            data-comment-field="title"
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
          <span>{t('interactionInspector.contextAndTiming')}</span>
          <small>
            {t('interactionInspector.present', { count: interaction.characterIds?.length ?? 0 })}
          </small>
        </summary>
        <div className="inspector-accordion-content">
          <div className="interaction-timing-block">
            <strong>{t('interactionInspector.durationTitle')}</strong>
            <p className="hint">{t('interactionInspector.durationHelp')}</p>
            <label>
              {t('interactionInspector.duration')}
              <span className="interaction-duration-input">
                <input
                  aria-label={t('interactionInspector.durationMinutes')}
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
                <small>{t('interactionInspector.minutes')}</small>
              </span>
            </label>
          </div>
          <label>
            {t('interactionInspector.location')}
            <select
              value={interaction.locationId ?? ''}
              onChange={(event) => {
                const locationId = event.target.value || null;
                updateLocalInteraction({ locationId });
                void onPatch(interaction.id, { locationId });
              }}
            >
              <option value="">{t('interactionInspector.noLocationChange')}</option>
              {(story.locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="character-presence-fieldset">
            <legend>{t('interactionInspector.charactersPresent')}</legend>
            {(story.characters?.length ?? 0) === 0 ? (
              <p className="hint">{t('interactionInspector.noCharacters')}</p>
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
          <span>{t('interactionInspector.effects')}</span>
          <small>{totalEffectCount}</small>
        </summary>
        <div className="inspector-accordion-content">
          <AddEffectControl unavailableReasons={effectUnavailableReasons} onAdd={addEffect} />
          {(interaction.statEffects?.length ?? 0) > 0 ? (
            <section className="interaction-effect-group">
              <div className="interaction-effect-group-header">
                <h4>{t('interactionInspector.statEffects')}</h4>
                <small>{interaction.statEffects?.length ?? 0}</small>
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
                    <strong className="interaction-effect-title">
                      {t('interactionInspector.statChange', { number: index + 1 })}
                    </strong>
                    <button
                      aria-label={t('interactionInspector.deleteStatEffect')}
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
                        ariaLabel={t('interactionInspector.statEffectTarget')}
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
                        {t('interactionInspector.stat')}
                        <select
                          aria-label={t('interactionInspector.affectedStat')}
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
                        {t('interactionInspector.operation')}
                        <select
                          aria-label={t('interactionInspector.statEffectOperation')}
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
                          <option value="add">{t('interactionInspector.addOperation')}</option>
                          <option value="set">{t('interactionInspector.setOperation')}</option>
                        </select>
                      </label>
                      <label>
                        {t('interactionInspector.value')}
                        <input
                          aria-label={t('interactionInspector.statEffectValue')}
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
            </section>
          ) : null}
          {(interaction.itemEffects?.length ?? 0) > 0 ? (
            <section className="interaction-effect-group">
              <div className="interaction-effect-group-header">
                <h4>{t('interactionInspector.itemEffects')}</h4>
                <small>{interaction.itemEffects?.length ?? 0}</small>
              </div>
              {(interaction.itemEffects ?? []).map((effect, index) => (
                <div
                  className="interaction-effect-card"
                  key={`${effect.characterId ?? ''}:${effect.itemDefinitionId ?? effect.itemId ?? index}`}
                >
                  <strong className="interaction-effect-title">
                    {t('interactionInspector.inventoryChange', { number: index + 1 })}
                  </strong>
                  <button
                    aria-label={t('interactionInspector.deleteItemEffect')}
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
                      ariaLabel={t('interactionInspector.itemEffectTarget')}
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
                      {t('interactionInspector.item')}
                      <select
                        aria-label={t('interactionInspector.affectedItem')}
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
                        {effect.itemId ? (
                          <option value="">{t('interactionInspector.legacyItem')}</option>
                        ) : null}
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
                      {t('interactionInspector.operation')}
                      <select
                        aria-label={t('interactionInspector.itemEffectOperation')}
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
                        <option value="obtain">{t('interactionInspector.obtainOperation')}</option>
                        <option value="lose">{t('interactionInspector.loseOperation')}</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
          {itemStatEffects.length > 0 ? (
            <section className="interaction-effect-group">
              <div className="interaction-effect-group-header">
                <h4>{t('interactionInspector.itemStatEffects')}</h4>
                <small>{itemStatEffects.length}</small>
              </div>
              {itemStatEffects.map((effect, index) => (
                <div
                  className="interaction-effect-card"
                  key={`${effect.itemId}:${effect.statDefinitionId}`}
                >
                  <strong className="interaction-effect-title">
                    {t('interactionInspector.itemStatChange', { number: index + 1 })}
                  </strong>
                  <button
                    aria-label={t('interactionInspector.deleteItemStatEffect')}
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
                      ariaLabel={t('interactionInspector.itemStatEffectTarget')}
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
                      {t('interactionInspector.stat')}
                      <select
                        aria-label={t('interactionInspector.affectedItemStat')}
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
                      {t('interactionInspector.operation')}
                      <select
                        aria-label={t('interactionInspector.itemStatEffectOperation')}
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
                        <option value="add">{t('interactionInspector.addOperation')}</option>
                        <option value="set">{t('interactionInspector.setOperation')}</option>
                      </select>
                    </label>
                    <label>
                      {t('interactionInspector.value')}
                      <input
                        aria-label={t('interactionInspector.itemStatEffectValue')}
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
            </section>
          ) : null}
        </div>
      </details>
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        {t('interactionInspector.deleteInteraction')}
      </button>
    </div>
  );
}
