import {
  getStatValueType,
  updateInteractionInStory,
  type Interaction,
  type StatEffect,
  type StatValue,
  type Story,
} from '@paralleax/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getStatTargets, statTargetId, statTargetLabel, type StatTarget } from '../storyStats';
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

type EffectType = 'stat' | 'inventory';

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
          const option = options.find(
            (candidate) => candidate.label === event.target.value && !candidate.disabled,
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
  const effectTypes: EffectType[] = ['stat', 'inventory'];

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

function effectTargetId(effect: StatEffect) {
  return `${effect.itemId ?? ''}:${effect.statId}`;
}

function isSameStatTarget(effect: StatEffect, target: StatTarget) {
  return effect.statId === target.assignment.id && effect.itemId === target.itemId;
}

function initialEffectValue(target: StatTarget): StatValue {
  return target.definition && getStatValueType(target.definition) === 'number'
    ? 1
    : target.assignment.initialValue;
}

function normalizeEffectValue(value: StatValue, target: StatTarget): StatValue {
  const valueType = target.definition ? getStatValueType(target.definition) : 'number';
  if (typeof value === valueType) return value;
  return target.assignment.initialValue;
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
  const interactionLinkTargets = story.interactions.filter(
    (candidate) => candidate.id !== interaction.id,
  );
  const statTargets = getStatTargets(story);
  const statEffects = interaction.statEffects ?? [];
  const statTargetOptions = statTargets.map((target) => ({
    id: statTargetId(target),
    label: statTargetLabel(target, t('attributes.owner.story')),
  }));
  const availableStatTarget = statTargets.find(
    (target) => !statEffects.some((effect) => isSameStatTarget(effect, target)),
  );
  const itemDefinitions = story.itemDefinitions ?? [];
  const availableItemEffect = characters
    .flatMap((character) => itemDefinitions.map((definition) => ({ character, definition })))
    .find(
      ({ character, definition }) =>
        !(interaction.itemEffects ?? []).some(
          ({ itemDefinitionId, characterId }) =>
            itemDefinitionId === definition.id && characterId === character.id,
        ),
    );
  const totalEffectCount = statEffects.length + (interaction.itemEffects?.length ?? 0);
  const effectUnavailableReasons: Record<EffectType, string | undefined> = {
    stat: availableStatTarget
      ? undefined
      : statTargets.length === 0
        ? t('interactionInspector.effectUnavailable.noStat')
        : t('interactionInspector.effectUnavailable.allStatsUsed'),
    inventory: availableItemEffect
      ? undefined
      : characters.length === 0
        ? t('interactionInspector.effectUnavailable.noCharacter')
        : itemDefinitions.length === 0
          ? t('interactionInspector.effectUnavailable.noItemDefinition')
          : t('interactionInspector.effectUnavailable.allInventoryEffectsUsed'),
  };

  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  function saveStatEffects(nextEffects: StatEffect[], persist = true) {
    updateLocalInteraction({ statEffects: nextEffects });
    if (persist) void onPatch(interaction.id, { statEffects: nextEffects });
  }

  function addEffect(type: EffectType) {
    if (type === 'stat' && availableStatTarget) {
      const isNumber =
        !availableStatTarget.definition ||
        getStatValueType(availableStatTarget.definition) === 'number';
      saveStatEffects([
        ...statEffects,
        {
          statId: availableStatTarget.assignment.id,
          ...(availableStatTarget.itemId ? { itemId: availableStatTarget.itemId } : {}),
          operation: isNumber ? 'add' : 'set',
          value: initialEffectValue(availableStatTarget),
        },
      ]);
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
            onChange={(event) => updateLocalInteraction({ title: event.target.value })}
            onBlur={(event) => void onPatch(interaction.id, { title: event.target.value })}
          />
        </label>
        <RichTextEditor
          interactionId={interaction.id}
          story={story}
          value={interaction.body}
          onChange={(body) => updateLocalInteraction({ body })}
          onBlur={(body) => void onPatch(interaction.id, { body })}
          interactionLinkTargets={interactionLinkTargets}
          conditionalTextBlocks={interaction.conditionalTextBlocks}
          onConditionalTextChange={(body, conditionalTextBlocks) => {
            updateLocalInteraction({ body, conditionalTextBlocks });
            void onPatch(interaction.id, { body, conditionalTextBlocks });
          }}
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
                  min="0"
                  step="1"
                  type="number"
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
            {characters.length === 0 ? (
              <p className="hint">{t('interactionInspector.noCharacters')}</p>
            ) : (
              characters.map((character) => (
                <label className="character-presence-option" key={character.id}>
                  <input
                    checked={(interaction.characterIds ?? []).includes(character.id)}
                    type="checkbox"
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
          {statEffects.length > 0 ? (
            <section className="interaction-effect-group">
              <div className="interaction-effect-group-header">
                <h4>{t('interactionInspector.statEffects')}</h4>
                <small>{statEffects.length}</small>
              </div>
              {statEffects.map((effect, index) => {
                const selectedTarget = statTargets.find((target) =>
                  isSameStatTarget(effect, target),
                );
                const valueType = selectedTarget?.definition
                  ? getStatValueType(selectedTarget.definition)
                  : 'number';
                const options = statTargetOptions.map((option) => ({
                  ...option,
                  disabled: statEffects.some(
                    (candidate, candidateIndex) =>
                      candidateIndex !== index && effectTargetId(candidate) === option.id,
                  ),
                }));
                return (
                  <div
                    className="interaction-effect-card"
                    key={`${effectTargetId(effect)}:${index}`}
                  >
                    <strong className="interaction-effect-title">
                      {t('interactionInspector.statChange', { number: index + 1 })}
                    </strong>
                    <button
                      aria-label={t('interactionInspector.deleteStatEffect')}
                      className="ghost danger interaction-effect-remove"
                      type="button"
                      onClick={() =>
                        saveStatEffects(
                          statEffects.filter((_, candidateIndex) => candidateIndex !== index),
                        )
                      }
                    >
                      x
                    </button>
                    <div className="interaction-effect-fields">
                      <SearchableTargetField
                        ariaLabel={t('interactionInspector.statEffectTarget')}
                        onSelect={(targetId) => {
                          const target = statTargets.find(
                            (candidate) => statTargetId(candidate) === targetId,
                          );
                          if (!target) return;
                          const nextEffects = [...statEffects];
                          const nextValueType = target.definition
                            ? getStatValueType(target.definition)
                            : 'number';
                          nextEffects[index] = {
                            statId: target.assignment.id,
                            ...(target.itemId ? { itemId: target.itemId } : {}),
                            operation: nextValueType === 'number' ? effect.operation : 'set',
                            value: normalizeEffectValue(effect.value, target),
                          };
                          saveStatEffects(nextEffects);
                        }}
                        options={options}
                        value={effectTargetId(effect)}
                      />
                      <label>
                        {t('interactionInspector.operation')}
                        <select
                          aria-label={t('interactionInspector.statEffectOperation')}
                          disabled={valueType !== 'number'}
                          value={effect.operation}
                          onChange={(event) => {
                            const nextEffects = [...statEffects];
                            nextEffects[index] = {
                              ...effect,
                              operation: event.target.value as 'add' | 'set',
                            };
                            saveStatEffects(nextEffects);
                          }}
                        >
                          {valueType === 'number' ? (
                            <option value="add">{t('interactionInspector.addOperation')}</option>
                          ) : null}
                          <option value="set">{t('interactionInspector.setOperation')}</option>
                        </select>
                      </label>
                      <label>
                        {t('interactionInspector.value')}
                        {valueType === 'boolean' ? (
                          <select
                            aria-label={t('interactionInspector.statEffectValue')}
                            value={String(effect.value)}
                            onChange={(event) => {
                              const nextEffects = [...statEffects];
                              nextEffects[index] = {
                                ...effect,
                                operation: 'set',
                                value: event.target.value === 'true',
                              };
                              saveStatEffects(nextEffects);
                            }}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            aria-label={t('interactionInspector.statEffectValue')}
                            type={valueType === 'number' ? 'number' : 'text'}
                            value={String(effect.value)}
                            onChange={(event) => {
                              const nextEffects = [...statEffects];
                              nextEffects[index] = {
                                ...effect,
                                value:
                                  valueType === 'number'
                                    ? Number(event.target.value)
                                    : event.target.value,
                              };
                              saveStatEffects(nextEffects, false);
                            }}
                            onBlur={(event) => {
                              const nextEffects = [...statEffects];
                              nextEffects[index] = {
                                ...effect,
                                value:
                                  valueType === 'number'
                                    ? Number(event.target.value)
                                    : event.target.value,
                              };
                              void onPatch(interaction.id, { statEffects: nextEffects });
                            }}
                          />
                        )}
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
                        (_, candidateIndex) => candidateIndex !== index,
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
                          <option key={definition.id} value={definition.id}>
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
        </div>
      </details>
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        {t('interactionInspector.deleteInteraction')}
      </button>
    </div>
  );
}
