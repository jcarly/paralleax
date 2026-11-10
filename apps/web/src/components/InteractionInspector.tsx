import {
  getStatValueType,
  variableReference,
  updateInteractionInStory,
  type Interaction,
  type StatEffect,
  type StatValue,
  type Story,
} from '@paralleax/shared';
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getStatTargets, type StatTarget } from '../storyStats';
import { InteractionEffectCard } from './InteractionEffectCard';
import { getInteractionEffectSummaries } from '../features/story/interactionEffectSummaries';
import { InteractionMetadataIcon } from '../features/story/InteractionMetadataIcon';
import { ContextThumbnail } from './StoryContextList';
import { InteractionLabel } from '../features/story/InteractionLabel';
import {
  InspectorCommentField,
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { ExpressionEditor } from './ExpressionEditor';
import { FieldHelpTooltip } from './FieldHelpTooltip';
import { RichTextEditor } from './RichTextEditor';
import { RichTextContent } from './RichTextContent';
import { hasAuthoredRichTextContent } from './richTextProjection';
import { VariablePicker } from './VariablePicker';
import {
  interactionTitleForDisplay,
  interactionTitlePlaceholder,
} from '../features/story/interactionTitlePresentation';

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
    <label className="form-field form-field--compact">
      {t('interactionInspector.target')}
      <input
        className="form-control form-control--compact"
        aria-label={ariaLabel}
        autoComplete="off"
        defaultValue={selectedLabel}
        key={`${value}:${selectedLabel}`}
        list={datalistId}
        onChange={(event) => {
          const option = options.find(
            (candidate) => candidate.label === event.target.value && !candidate.disabled,
          );
          if (option) {
            onSelect(option.id);
          }
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
        aria-label={t('interactionInspector.addEffect')}
        className="ghost interaction-add-effect"
        title={t('interactionInspector.addEffect')}
        type="button"
        onClick={() => setIsChoosing(true)}
      >
        <span aria-hidden="true">+</span>
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

function normalizeEffectValue(value: StatValue, target?: StatTarget): StatValue {
  if (!target) {
    return value;
  }
  const valueType = target.definition ? getStatValueType(target.definition) : 'number';
  if (typeof value === valueType) {
    return value;
  }
  return target.assignment.initialValue;
}

function targetValueType(target?: StatTarget) {
  return target?.definition ? getStatValueType(target.definition) : 'number';
}

function replaceStatEffect(statEffects: StatEffect[], index: number, nextEffect: StatEffect) {
  const nextEffects = [...statEffects];
  nextEffects[index] = nextEffect;
  return nextEffects;
}

function selectStatEffectTarget({
  statEffects,
  index,
  effect,
  target,
  valueType,
}: {
  statEffects: StatEffect[];
  index: number;
  effect: StatEffect;
  target: StatTarget;
  valueType: ReturnType<typeof getStatValueType> | 'number';
}) {
  const nextValueType = targetValueType(target);
  const nextEffect: StatEffect = {
    statId: target.assignment.id,
    ...(target.itemId ? { itemId: target.itemId } : {}),
    operation: nextValueType === 'number' ? effect.operation : 'set',
    value: normalizeEffectValue(effect.value ?? target.assignment.initialValue, target),
  };
  if (effect.expression !== undefined && nextValueType === valueType) {
    delete nextEffect.value;
    nextEffect.expression = effect.expression;
  }
  return replaceStatEffect(statEffects, index, nextEffect);
}

function toggleStatEffectExpression({
  statEffects,
  index,
  effect,
  target,
  fallbackTarget,
}: {
  statEffects: StatEffect[];
  index: number;
  effect: StatEffect;
  target?: StatTarget;
  fallbackTarget?: StatTarget;
}) {
  const nextEffect = { ...effect };
  if (effect.expression !== undefined) {
    delete nextEffect.expression;
    nextEffect.value = normalizeEffectValue(
      effect.value ?? fallbackTarget?.assignment.initialValue ?? 0,
      fallbackTarget,
    );
  } else {
    nextEffect.expression = target ? variableReference(target.assignment.id, target.itemId) : '@{}';
    delete nextEffect.value;
  }
  return replaceStatEffect(statEffects, index, nextEffect);
}

function updateStatEffectValue({
  statEffects,
  index,
  effect,
  value,
  valueType,
}: {
  statEffects: StatEffect[];
  index: number;
  effect: StatEffect;
  value: string;
  valueType: ReturnType<typeof getStatValueType> | 'number';
}) {
  return replaceStatEffect(statEffects, index, {
    ...effect,
    value:
      valueType === 'number' ? Number(value) : valueType === 'boolean' ? value === 'true' : value,
    ...(valueType === 'boolean' ? { operation: 'set' as const } : {}),
  });
}

function updateStatEffectOperation(
  statEffects: StatEffect[],
  index: number,
  effect: StatEffect,
  operation: string,
) {
  if (operation !== 'add' && operation !== 'set') {
    return undefined;
  }
  return replaceStatEffect(statEffects, index, { ...effect, operation });
}

type InteractionInspectorProps = {
  story: Story;
  interaction: Interaction;
  onChange: (story: Story) => void;
  onPatch: (id: string, patch: Partial<Interaction>) => Promise<boolean | void>;
  onContentSaved?: (body: string) => void;
  onDelete: () => Promise<void>;
  onSelectInteraction?: (interactionId: string) => void;
  onAddOption?: () => void | Promise<void>;
} & InspectorTextCommentProps &
  InspectorSemanticCommentProps;

export function InteractionInspector(props: InteractionInspectorProps) {
  return <InteractionInspectorView key={props.interaction.id} {...props} />;
}

function InteractionInspectorView({
  story,
  interaction,
  onChange,
  onPatch,
  onContentSaved,
  onDelete,
  onSelectInteraction,
  onAddOption,
  textCommentCounts,
  onOpenTextComments,
  semanticCommentCounts,
  onOpenSemanticComments,
}: InteractionInspectorProps) {
  const { t } = useTranslation();
  const [bodyEditor, setBodyEditor] = useState({ interactionId: interaction.id, editing: false });
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingLocation, setEditingLocation] = useState(false);
  const [editingCharacters, setEditingCharacters] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const bodyDraftRef = useRef<{ interactionId: string; body: string } | undefined>(undefined);
  const characters = story.characters ?? [];
  const interactionLinkTargets = story.interactions.filter(
    (candidate) => candidate.id !== interaction.id,
  );
  const statTargets = getStatTargets(story);
  const statEffects = interaction.statEffects ?? [];
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
  const effectSummaries = getInteractionEffectSummaries(story, interaction, t);
  const location = (story.locations ?? []).find(({ id }) => id === interaction.locationId);
  const presentCharacters = characters.filter((character) =>
    (interaction.characterIds ?? []).includes(character.id),
  );
  const visibleCharacters = presentCharacters.slice(0, 3);
  const locationSummary = location?.name ?? t('interactionInspector.noLocationChange');
  const locationTooltip = locationSummary;
  const characterSummary =
    presentCharacters.map(({ name }) => name).join(', ') ||
    t('interactionInspector.noCharacters');
  const characterTooltip = characterSummary;
  const hasDuration = interaction.durationMinutes !== undefined;
  const durationSummary = hasDuration
    ? `${interaction.durationMinutes} ${t('interactionInspector.minutesShort')}`
    : t('interactionInspector.noDuration');
  const durationTooltip = durationSummary;
  const optionDestinations = story.interactions.filter((candidate) =>
    candidate.triggers.some((trigger) => trigger.inputInteractionIds.includes(interaction.id)),
  );
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

  function commitBodyDraft(body: string) {
    const draft = bodyDraftRef.current;
    const candidateBody = draft?.interactionId === interaction.id ? draft.body : body;
    const candidateHasContent = hasAuthoredRichTextContent(candidateBody);
    const currentHasContent = hasAuthoredRichTextContent(interaction.body);
    const nextBody = candidateHasContent
      ? candidateBody
      : currentHasContent
        ? ''
        : interaction.body;
    bodyDraftRef.current = undefined;
    if (nextBody === interaction.body) {
      return;
    }
    updateLocalInteraction({ body: nextBody });
    void onPatch(interaction.id, { body: nextBody }).then((saved) => {
      if (saved !== false) {
        onContentSaved?.(nextBody);
      }
    });
  }

  function startBodyEditing() {
    setBodyEditor({ interactionId: interaction.id, editing: true });
  }

  function handleBodyPreviewKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    if (event.target instanceof Element && event.target.closest('button')) {
      return;
    }
    event.preventDefault();
    startBodyEditing();
  }

  function handleBodyBlur(body: string) {
    commitBodyDraft(body);
  }

  function handleBodyRegionBlur(event: FocusEvent<HTMLDivElement>) {
    const nextElement = event.relatedTarget;
    if (nextElement instanceof Node && event.currentTarget.contains(nextElement)) {
      return;
    }
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        (activeElement.closest('.rich-text-editor') || activeElement.closest('[role="dialog"]'))
      ) {
        return;
      }
      setBodyEditor({ interactionId: interaction.id, editing: false });
    }, 0);
  }

  function saveStatEffects(nextEffects: StatEffect[], persist = true) {
    updateLocalInteraction({ statEffects: nextEffects });
    if (persist) {
      void onPatch(interaction.id, { statEffects: nextEffects });
    }
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
        <InspectorCommentField
          field="title"
          label={t('interactionInspector.title')}
          textCommentCounts={textCommentCounts}
          onOpenTextComments={onOpenTextComments}
        >
          <InteractionLabel
            label={interactionTitleForDisplay(interaction, t)}
            className="interaction-inspector-title-bubble"
            leadingIcon="→"
            dataCommentField="title"
            ariaLabel={`${t('interactionInspector.title')}: ${interactionTitleForDisplay(interaction, t)}`}
            onActivate={() => setEditingTitle(true)}
            editable={
              editingTitle
                ? {
                    autoFocus: true,
                    className: 'interaction-inspector-title-input',
                    'data-comment-field': 'title',
                    'aria-label': t('interactionInspector.title'),
                    placeholder: interactionTitlePlaceholder(interaction, t),
                    value: interaction.title,
                    onChange: (event) => updateLocalInteraction({ title: event.target.value }),
                    onBlur: (event) => {
                      void onPatch(interaction.id, { title: event.currentTarget.value });
                      setEditingTitle(false);
                    },
                    onKeyDown: (event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    },
                  }
                : undefined
            }
          />
        </InspectorCommentField>
      </section>
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'contextAndTiming' }}
        label={t('interactionInspector.contextAndTiming')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <section className="interaction-inspector-context">
          <InspectorCommentSlot
            slot={{ kind: 'field', field: 'location' }}
            label={t('interactionInspector.location')}
            semanticCommentCounts={semanticCommentCounts}
            onOpenSemanticComments={onOpenSemanticComments}
          >
            {editingLocation ? (
              <label className="form-field form-field--compact">
                {t('interactionInspector.location')}
                <select
                  autoFocus
                  className="form-control form-control--compact"
                  value={interaction.locationId ?? ''}
                  onChange={(event) => {
                    const locationId = event.target.value || null;
                    updateLocalInteraction({ locationId });
                    void onPatch(interaction.id, { locationId });
                    setEditingLocation(false);
                  }}
                  onBlur={() => setEditingLocation(false)}
                >
                  <option value="">{t('interactionInspector.noLocationChange')}</option>
                  {(story.locations ?? []).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <FieldHelpTooltip
                className={`interaction-metadata-control${location ? ' has-value' : ' is-empty'}`}
                label={`${t('interactionInspector.location')}: ${locationSummary}`}
                help={locationTooltip}
                onClick={() => setEditingLocation(true)}
              >
                {location ? (
                  <ContextThumbnail
                    className="interaction-metadata-avatar"
                    imageUrl={location.imageUrl}
                    fallback={getInitials(location.name)}
                  />
                ) : (
                  <InteractionMetadataIcon kind="location" />
                )}
              </FieldHelpTooltip>
            )}
          </InspectorCommentSlot>
          <InspectorCommentSlot
            slot={{ kind: 'field', field: 'characters' }}
            label={t('interactionInspector.charactersPresent')}
            semanticCommentCounts={semanticCommentCounts}
            onOpenSemanticComments={onOpenSemanticComments}
          >
            {editingCharacters ? (
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
                            : (interaction.characterIds ?? []).filter(
                                (id) => id !== character.id,
                              );
                          updateLocalInteraction({ characterIds });
                          void onPatch(interaction.id, { characterIds });
                        }}
                      />
                      {character.imageUrl ? (
                        <img
                          className="character-presence-avatar"
                          src={character.imageUrl}
                          alt=""
                        />
                      ) : (
                        <span className="character-presence-avatar" aria-hidden="true">
                          {getInitials(character.name)}
                        </span>
                      )}
                      <span>{character.name}</span>
                    </label>
                  ))
                )}
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setEditingCharacters(false)}
                >
                  {t('interactionInspector.doneEditing')}
                </button>
              </fieldset>
            ) : (
              <FieldHelpTooltip
                className={`interaction-metadata-control${presentCharacters.length ? ' has-value' : ' is-empty'}`}
                label={`${t('interactionInspector.charactersPresent')}: ${characterSummary}`}
                help={characterTooltip}
                onClick={() => setEditingCharacters(true)}
              >
                {presentCharacters.length > 0 ? (
                  <span aria-hidden="true" className="interaction-metadata-avatar-stack">
                    {visibleCharacters.map((character) => (
                      <ContextThumbnail
                        key={character.id}
                        className="interaction-metadata-avatar"
                        imageUrl={character.imageUrl}
                        fallback={getInitials(character.name)}
                      />
                    ))}
                    {presentCharacters.length > visibleCharacters.length ? (
                      <span className="interaction-metadata-avatar-overflow">
                        +{presentCharacters.length - visibleCharacters.length}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <InteractionMetadataIcon kind="characters" />
                )}
              </FieldHelpTooltip>
            )}
          </InspectorCommentSlot>
          <InspectorCommentSlot
            slot={{ kind: 'field', field: 'duration' }}
            label={t('interactionInspector.duration')}
            semanticCommentCounts={semanticCommentCounts}
            onOpenSemanticComments={onOpenSemanticComments}
          >
            {editingDuration ? (
              <div className="form-field form-field--compact">
                <div className="field-label-with-help">
                  <span>{t('interactionInspector.duration')}</span>
                  <FieldHelpTooltip
                    label={t('interactionInspector.duration')}
                    help={t('interactionInspector.durationHelp')}
                  />
                </div>
                <span className="interaction-duration-input form-control-group form-control-group--compact">
                  <input
                    autoFocus
                    className="form-control form-control--compact"
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
                      setEditingDuration(false);
                    }}
                  />
                  <small className="form-control-suffix">
                    {t('interactionInspector.minutes')}
                  </small>
                </span>
              </div>
            ) : (
              <FieldHelpTooltip
                className={`interaction-metadata-control${hasDuration ? ' has-value' : ' is-empty'}`}
                label={`${t('interactionInspector.duration')}: ${durationSummary}`}
                help={durationTooltip}
                onClick={() => setEditingDuration(true)}
              >
                <InteractionMetadataIcon kind="time" />
                {hasDuration ? (
                  <span className="interaction-metadata-duration-value">
                    {durationSummary}
                  </span>
                ) : null}
              </FieldHelpTooltip>
            )}
          </InspectorCommentSlot>
        </section>
      </InspectorCommentSlot>
      <section className="interaction-inspector-content">
        <InspectorCommentField
          field="body"
          label={t('richText.content')}
          textCommentCounts={textCommentCounts}
          onOpenTextComments={onOpenTextComments}
        >
          {bodyEditor.editing ? (
            <div onBlurCapture={handleBodyRegionBlur}>
              <RichTextEditor
                autoFocus={bodyEditor.editing}
                interactionId={interaction.id}
                story={story}
                value={interaction.body}
                onChange={(body) => {
                  bodyDraftRef.current = { interactionId: interaction.id, body };
                }}
                onBlur={handleBodyBlur}
                revealToolbarOnFocus
                interactionLinkTargets={interactionLinkTargets}
                conditionalTextBlocks={interaction.conditionalTextBlocks}
                onConditionalTextChange={(body, conditionalTextBlocks) => {
                  bodyDraftRef.current = undefined;
                  updateLocalInteraction({ body, conditionalTextBlocks });
                  void onPatch(interaction.id, { body, conditionalTextBlocks }).then((saved) => {
                    if (saved !== false) {
                      onContentSaved?.(body);
                    }
                  });
                }}
                onConditionalTargetClick={onSelectInteraction}
              />
            </div>
          ) : hasAuthoredRichTextContent(interaction.body) ? (
            <div
              aria-label={`${t('richText.content')}. ${t('interactionInspector.editValueHelp')}`}
              className="interaction-content-preview"
              onBlurCapture={handleBodyRegionBlur}
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest(
                    'button[data-interaction-link-target], button[data-conditional-text-link]',
                  )
                ) {
                  return;
                }
                startBodyEditing();
              }}
              onKeyDown={handleBodyPreviewKeyDown}
              role="group"
              tabIndex={0}
            >
              <RichTextContent
                className="story-body"
                html={interaction.body}
                onInteractionLinkClick={(interactionId) => onSelectInteraction?.(interactionId)}
              />
            </div>
          ) : (
            <div className="interaction-content-empty">
              <button
                className="secondary interaction-content-edit-toggle"
                data-comment-exclude="true"
                type="button"
                onClick={startBodyEditing}
              >
                {t('richText.addContent')}
              </button>
            </div>
          )}
        </InspectorCommentField>
      </section>
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'effects' }}
        label={t('interactionInspector.effects')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <section className="interaction-inspector-effects">
          <div className="interaction-inspector-section-heading">
            <h3>{t('interactionInspector.effects')}</h3>
            <small>{totalEffectCount}</small>
            <AddEffectControl unavailableReasons={effectUnavailableReasons} onAdd={addEffect} />
          </div>
          {statEffects.length > 0 ? (
            <section className="interaction-effect-group">
              <div className="interaction-effect-group-header editor-heading-row">
                <h4>{t('interactionInspector.statEffects')}</h4>
                <small>{statEffects.length}</small>
              </div>
              {statEffects.map((effect, index) => {
                const selectedTarget = statTargets.find((target) =>
                  isSameStatTarget(effect, target),
                );
                const valueType = targetValueType(selectedTarget);
                return (
                  <details
                    className="interaction-effect-editor"
                    key={`${effectTargetId(effect)}:${index}`}
                  >
                    <summary>{effectSummaries[index]?.label}</summary>
                    <InteractionEffectCard
                      title={t('interactionInspector.statChange', { number: index + 1 })}
                      removeAction={
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
                      }
                    >
                      <div aria-label={t('interactionInspector.statEffectTarget')}>
                        <VariablePicker
                          story={story}
                          selectedTarget={selectedTarget}
                          filter={(target) =>
                            !statEffects.some(
                              (candidate, candidateIndex) =>
                                candidateIndex !== index && isSameStatTarget(candidate, target),
                            )
                          }
                          onSelect={({ target }) => {
                            saveStatEffects(
                              selectStatEffectTarget({
                                statEffects,
                                index,
                                effect,
                                target,
                                valueType,
                              }),
                            );
                          }}
                        />
                      </div>
                      <label className="form-field form-field--compact">
                        {t('interactionInspector.operation')}
                        <select
                          className="form-control form-control--compact"
                          aria-label={t('interactionInspector.statEffectOperation')}
                          disabled={valueType !== 'number'}
                          value={effect.operation}
                          onChange={(event) => {
                            const nextEffects = updateStatEffectOperation(
                              statEffects,
                              index,
                              effect,
                              event.target.value,
                            );
                            if (nextEffects) {
                              saveStatEffects(nextEffects);
                            }
                          }}
                        >
                          {valueType === 'number' ? (
                            <option value="add">{t('interactionInspector.addOperation')}</option>
                          ) : null}
                          <option value="set">{t('interactionInspector.setOperation')}</option>
                        </select>
                      </label>
                      <div className="form-field form-field--compact">
                        <label>{t('interactionInspector.value')}</label>
                        <button
                          type="button"
                          onClick={() => {
                            saveStatEffects(
                              toggleStatEffectExpression({
                                statEffects,
                                index,
                                effect,
                                target: selectedTarget,
                                fallbackTarget: selectedTarget ?? statTargets[0],
                              }),
                            );
                          }}
                        >
                          {effect.expression !== undefined
                            ? t('interactionInspector.literalValue')
                            : t('interactionInspector.expressionValue')}
                        </button>
                        {effect.expression !== undefined ? (
                          <ExpressionEditor
                            key={`${effect.statId}:${effect.itemId ?? ''}`}
                            story={story}
                            value={effect.expression}
                            expectedType={valueType}
                            onChange={(expression) => {
                              saveStatEffects(
                                replaceStatEffect(statEffects, index, {
                                  ...effect,
                                  value: undefined,
                                  expression,
                                }),
                                false,
                              );
                            }}
                            onBlur={(expression) => {
                              void onPatch(interaction.id, {
                                statEffects: replaceStatEffect(statEffects, index, {
                                  ...effect,
                                  value: undefined,
                                  expression,
                                }),
                              });
                            }}
                          />
                        ) : valueType === 'boolean' ? (
                          <select
                            className="form-control form-control--compact"
                            aria-label={t('interactionInspector.statEffectValue')}
                            value={String(effect.value)}
                            onChange={(event) => {
                              saveStatEffects(
                                updateStatEffectValue({
                                  statEffects,
                                  index,
                                  effect,
                                  value: event.target.value,
                                  valueType,
                                }),
                              );
                            }}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            className="form-control form-control--compact"
                            aria-label={t('interactionInspector.statEffectValue')}
                            type={valueType === 'number' ? 'number' : 'text'}
                            value={String(effect.value ?? '')}
                            onChange={(event) => {
                              saveStatEffects(
                                updateStatEffectValue({
                                  statEffects,
                                  index,
                                  effect,
                                  value: event.target.value,
                                  valueType,
                                }),
                                false,
                              );
                            }}
                            onBlur={(event) => {
                              void onPatch(interaction.id, {
                                statEffects: updateStatEffectValue({
                                  statEffects,
                                  index,
                                  effect,
                                  value: event.target.value,
                                  valueType,
                                }),
                              });
                            }}
                          />
                        )}
                      </div>
                    </InteractionEffectCard>
                  </details>
                );
              })}
            </section>
          ) : null}
          {(interaction.itemEffects?.length ?? 0) > 0 ? (
            <section className="interaction-effect-group">
              <div className="interaction-effect-group-header editor-heading-row">
                <h4>{t('interactionInspector.itemEffects')}</h4>
                <small>{interaction.itemEffects?.length ?? 0}</small>
              </div>
              {(interaction.itemEffects ?? []).map((effect, index) => (
                <details
                  className="interaction-effect-editor"
                  key={`${effect.characterId ?? ''}:${effect.itemDefinitionId ?? effect.itemId ?? index}`}
                >
                  <summary>{effectSummaries[statEffects.length + index]?.label}</summary>
                  <InteractionEffectCard
                    title={t('interactionInspector.inventoryChange', { number: index + 1 })}
                    removeAction={
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
                    }
                  >
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
                    <label className="form-field form-field--compact">
                      {t('interactionInspector.item')}
                      <select
                        className="form-control form-control--compact"
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
                    <label className="form-field form-field--compact">
                      {t('interactionInspector.operation')}
                      <select
                        className="form-control form-control--compact"
                        aria-label={t('interactionInspector.itemEffectOperation')}
                        value={effect.operation}
                        onChange={(event) => {
                          const operation = event.target.value;
                          if (operation !== 'obtain' && operation !== 'lose') {
                            return;
                          }
                          const itemEffects = [...(interaction.itemEffects ?? [])];
                          itemEffects[index] = {
                            ...effect,
                            operation,
                          };
                          updateLocalInteraction({ itemEffects });
                          void onPatch(interaction.id, { itemEffects });
                        }}
                      >
                        <option value="obtain">{t('interactionInspector.obtainOperation')}</option>
                        <option value="lose">{t('interactionInspector.loseOperation')}</option>
                      </select>
                    </label>
                  </InteractionEffectCard>
                </details>
              ))}
            </section>
          ) : null}
        </section>
      </InspectorCommentSlot>
      <section className="interaction-inspector-options">
        <div className="interaction-inspector-section-heading">
          <h3>{t('interactionInspector.options')}</h3>
          {onAddOption ? (
            <button
              aria-label={t('interactionInspector.addOption')}
              className="ghost interaction-inspector-add-option"
              title={t('interactionInspector.addOption')}
              type="button"
              onClick={() => void onAddOption()}
            >
              <span aria-hidden="true">+</span>
            </button>
          ) : null}
        </div>
        {optionDestinations.length > 0 ? (
          <ul className="interaction-inspector-option-list">
            {optionDestinations.map((destination) => (
              <li key={destination.id}>
                <button
                  className="interaction-inspector-readout interaction-inspector-option-readout"
                  type="button"
                  onClick={() => onSelectInteraction?.(destination.id)}
                >
                  <InteractionLabel label={interactionTitleForDisplay(destination, t)} />
                  <i className="interaction-inspector-option-arrow" aria-hidden="true">
                    →
                  </i>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">{t('interactionInspector.noOptions')}</p>
        )}
      </section>
      <hr />
      <button className="danger" onClick={() => void onDelete()}>
        {t('interactionInspector.deleteInteraction')}
      </button>
    </div>
  );
}
