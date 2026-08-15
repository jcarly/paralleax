import type {
  Interaction,
  Story,
  TemporalCondition,
  TriggerCondition,
  Weekday,
} from '@paralleax/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRelatedTriggerVariantIds } from '../storyGraph';

type ConditionType = 'interaction' | 'location' | 'character' | 'stat' | 'item' | 'dateTime';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  onSaveTrigger,
  onCreateTriggerVariant,
  onDeleteTriggerGroup,
  onDeleteTrigger,
  onDeleteTriggerVariants,
}: {
  story: Story;
  interaction: Interaction;
  trigger: Interaction['triggers'][number];
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) => Promise<void>;
  onCreateTriggerVariant: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerGroup: (
    interactionId: string,
    triggerId: string,
    nextTriggerId: string,
  ) => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerVariants: (interactionId: string, triggerIds: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const variantIds = getRelatedTriggerVariantIds(interaction, trigger);
  const variants = interaction.triggers.filter((item) => variantIds.includes(item.id));
  const hasOrVariants = variants.length > 1;
  const stats = (story.characters ?? []).flatMap((character) =>
    (character.stats ?? []).map((stat) => ({
      ...stat,
      label: `${character.name} — ${
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        t('triggerInspector.unknownStat')
      }`,
    })),
  );

  async function updateTrigger(
    targetTrigger: Interaction['triggers'][number],
    inputIds: string[],
    conditions: TriggerCondition[],
  ) {
    await onSaveTrigger(interaction.id, targetTrigger.id, inputIds, conditions);
  }

  function createCondition(type: ConditionType): TriggerCondition | undefined {
    switch (type) {
      case 'interaction': {
        const candidate = story.interactions.find((item) => item.id !== interaction.id);
        return candidate ? { interactionId: candidate.id, hasBeenVisited: true } : undefined;
      }
      case 'location': {
        const location = story.locations?.[0];
        return location ? { locationId: location.id, isCurrentLocation: true } : undefined;
      }
      case 'character': {
        const character = story.characters?.[0];
        return character ? { characterId: character.id, isPresent: true } : undefined;
      }
      case 'stat': {
        const stat = stats[0];
        return stat ? { statId: stat.id, operator: 'gte', value: stat.initialValue } : undefined;
      }
      case 'item': {
        const definition = story.itemDefinitions?.[0];
        return definition ? { itemDefinitionId: definition.id, isOwned: true } : undefined;
      }
      case 'dateTime':
        return { temporal: { weekdays: ['monday'] } };
    }
  }

  return (
    <div>
      <h3>{t('triggerInspector.title')}</h3>
      {hasOrVariants ? <p className="hint">{t('triggerInspector.variantsHelp')}</p> : null}
      {variants.map((variant, variantIndex) => (
        <div className="trigger-variant" key={variant.id}>
          {variantIndex > 0 ? <div className="or-divider">{t('triggerInspector.or')}</div> : null}
          {hasOrVariants ? (
            <div className="trigger-variant-header">
              <h4>{t('triggerInspector.group', { number: variantIndex + 1 })}</h4>
              <button
                aria-label={t('triggerInspector.deleteGroup')}
                className="ghost danger trigger-variant-delete"
                title={t('triggerInspector.deleteGroup')}
                type="button"
                onClick={() => {
                  const nextVariant = variants[variantIndex + 1] ?? variants[variantIndex - 1];
                  if (nextVariant) {
                    void onDeleteTriggerGroup(interaction.id, variant.id, nextVariant.id);
                  }
                }}
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="conditions">
            {variant.conditions.map((condition, index) => (
              <div
                className="condition"
                key={`${variant.id}-${
                  'interactionId' in condition
                    ? condition.interactionId
                    : 'locationId' in condition
                      ? condition.locationId
                      : 'characterId' in condition
                        ? condition.characterId
                        : 'itemDefinitionId' in condition
                          ? condition.itemDefinitionId
                          : 'statId' in condition
                            ? condition.statId
                            : 'time'
                }-${index}`}
              >
                {'interactionId' in condition ? (
                  <>
                    <select
                      aria-label={t('triggerInspector.conditionInteraction')}
                      value={condition.interactionId}
                      onChange={(e) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, interactionId: e.target.value };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      {story.interactions
                        .filter((item) => item.id !== interaction.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </select>
                    <select
                      aria-label={t('triggerInspector.interactionOperator')}
                      value={condition.hasBeenVisited ? 'visited' : 'not-visited'}
                      onChange={(e) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          hasBeenVisited: e.target.value === 'visited',
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="visited">{t('triggerInspector.visited')}</option>
                      <option value="not-visited">{t('triggerInspector.notVisited')}</option>
                    </select>
                  </>
                ) : 'locationId' in condition ? (
                  <>
                    <select
                      aria-label={t('triggerInspector.conditionLocation')}
                      value={condition.locationId}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, locationId: event.target.value };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      {(story.locations ?? []).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t('triggerInspector.locationOperator')}
                      value={condition.isCurrentLocation ? 'current' : 'not-current'}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          isCurrentLocation: event.target.value === 'current',
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="current">{t('triggerInspector.currentLocation')}</option>
                      <option value="not-current">
                        {t('triggerInspector.notCurrentLocation')}
                      </option>
                    </select>
                  </>
                ) : 'characterId' in condition ? (
                  <>
                    <select
                      aria-label={t('triggerInspector.conditionCharacter')}
                      value={condition.characterId}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, characterId: event.target.value };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      {(story.characters ?? []).map((character) => (
                        <option key={character.id} value={character.id}>
                          {character.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t('triggerInspector.characterOperator')}
                      value={condition.isPresent ? 'present' : 'absent'}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          isPresent: event.target.value === 'present',
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="present">{t('triggerInspector.present')}</option>
                      <option value="absent">{t('triggerInspector.absent')}</option>
                    </select>
                  </>
                ) : 'itemDefinitionId' in condition ? (
                  <>
                    <select
                      aria-label={t('triggerInspector.conditionItem')}
                      value={condition.itemDefinitionId}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          itemDefinitionId: event.target.value,
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      {(story.itemDefinitions ?? []).map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {definition.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t('triggerInspector.itemOperator')}
                      value={condition.isOwned ? 'owned' : 'not-owned'}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          isOwned: event.target.value === 'owned',
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="owned">{t('triggerInspector.owned')}</option>
                      <option value="not-owned">{t('triggerInspector.notOwned')}</option>
                    </select>
                  </>
                ) : 'temporal' in condition ? (
                  <TemporalConditionFields
                    condition={condition}
                    defaultDate={(story.startDateTime ?? '2000-01-03T08:00').slice(0, 10)}
                    onChange={(nextCondition) => {
                      const next = [...variant.conditions];
                      next[index] = nextCondition;
                      void updateTrigger(variant, variant.inputInteractionIds, next);
                    }}
                  />
                ) : (
                  <>
                    <select
                      aria-label={t('triggerInspector.conditionStat')}
                      value={condition.statId}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, statId: event.target.value };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      {stats.map((stat) => (
                        <option key={stat.id} value={stat.id}>
                          {stat.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t('triggerInspector.statOperator')}
                      value={condition.operator}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = {
                          ...condition,
                          operator: event.target.value as typeof condition.operator,
                        };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    >
                      <option value="eq">{t('triggerInspector.equals')}</option>
                      <option value="lt">{t('triggerInspector.lessThan')}</option>
                      <option value="lte">{t('triggerInspector.atMost')}</option>
                      <option value="gt">{t('triggerInspector.greaterThan')}</option>
                      <option value="gte">{t('triggerInspector.atLeast')}</option>
                    </select>
                    <input
                      aria-label={t('triggerInspector.statValue')}
                      type="number"
                      value={condition.value}
                      onChange={(event) => {
                        const next = [...variant.conditions];
                        next[index] = { ...condition, value: Number(event.target.value) };
                        void updateTrigger(variant, variant.inputInteractionIds, next);
                      }}
                    />
                  </>
                )}
                <button
                  className="ghost danger"
                  onClick={() =>
                    void updateTrigger(
                      variant,
                      variant.inputInteractionIds,
                      variant.conditions.filter((_, i) => i !== index),
                    )
                  }
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <AddConditionControl
            initiallyOpen={
              hasOrVariants && variant.id === trigger.id && variant.conditions.length === 0
            }
            unavailableReasons={{
              interaction:
                story.interactions.length < 2
                  ? t('triggerInspector.conditionUnavailable.interaction')
                  : undefined,
              location:
                (story.locations?.length ?? 0) === 0
                  ? t('triggerInspector.conditionUnavailable.location')
                  : undefined,
              character:
                (story.characters?.length ?? 0) === 0
                  ? t('triggerInspector.conditionUnavailable.character')
                  : undefined,
              stat:
                stats.length === 0 ? t('triggerInspector.conditionUnavailable.stat') : undefined,
              item:
                (story.itemDefinitions?.length ?? 0) === 0
                  ? t('triggerInspector.conditionUnavailable.item')
                  : undefined,
              dateTime: undefined,
            }}
            onAdd={(type) => {
              const condition = createCondition(type);
              if (condition) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  condition,
                ]);
              }
            }}
          />
        </div>
      ))}
      <button
        className="trigger-add-group"
        disabled={trigger.inputInteractionIds.length === 0 || story.interactions.length < 2}
        type="button"
        onClick={() => void onCreateTriggerVariant(interaction.id, trigger.id)}
      >
        <span aria-hidden="true" className="trigger-add-group-icon">
          +
        </span>
        <span>{t('triggerInspector.addGroup')}</span>
      </button>
      <hr />
      {hasOrVariants ? (
        <button
          className="danger trigger-delete-action"
          onClick={() => void onDeleteTriggerVariants(interaction.id, variantIds)}
        >
          {t('triggerInspector.deleteAllGroups')}
        </button>
      ) : (
        <button
          className="danger trigger-delete-action"
          onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}
        >
          {t('triggerInspector.deleteTrigger')}
        </button>
      )}
    </div>
  );
}

function AddConditionControl({
  initiallyOpen = false,
  unavailableReasons,
  onAdd,
}: {
  initiallyOpen?: boolean;
  unavailableReasons: Record<ConditionType, string | undefined>;
  onAdd: (type: ConditionType) => void;
}) {
  const { t } = useTranslation();
  const tooltipIdPrefix = useId();
  const [isChoosing, setIsChoosing] = useState(initiallyOpen);
  const conditionTypes: ConditionType[] = [
    'interaction',
    'location',
    'character',
    'stat',
    'item',
    'dateTime',
  ];

  if (!isChoosing) {
    return (
      <button
        className="secondary trigger-add-condition"
        type="button"
        onClick={() => setIsChoosing(true)}
      >
        {t('triggerInspector.addCondition')}
      </button>
    );
  }

  return (
    <div
      aria-label={t('triggerInspector.conditionType')}
      className="trigger-condition-picker"
      role="group"
    >
      <div className="trigger-condition-picker-header">
        <span>{t('triggerInspector.chooseConditionType')}</span>
        <button
          aria-label={t('triggerInspector.cancelAddCondition')}
          className="ghost trigger-condition-picker-cancel"
          title={t('triggerInspector.cancelAddCondition')}
          type="button"
          onClick={() => setIsChoosing(false)}
        >
          ×
        </button>
      </div>
      <div className="trigger-condition-type-options">
        {conditionTypes.map((type) => {
          const unavailableReason = unavailableReasons[type];
          const tooltipId = `${tooltipIdPrefix}-${type}`;
          return (
            <div
              aria-describedby={unavailableReason ? tooltipId : undefined}
              className="trigger-condition-type-option"
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
                {t(`triggerInspector.conditionTypes.${type}`)}
              </button>
              {unavailableReason ? (
                <span className="trigger-condition-type-tooltip" id={tooltipId} role="tooltip">
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

const weekdayOptions: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function TemporalConditionFields({
  condition,
  defaultDate,
  onChange,
}: {
  condition: TemporalCondition;
  defaultDate: string;
  onChange: (condition: TemporalCondition) => void;
}) {
  const { t } = useTranslation();
  const temporal = condition.temporal;
  const update = (patch: Partial<TemporalCondition['temporal']>) =>
    onChange({ temporal: { ...temporal, ...patch } });

  return (
    <fieldset className="temporal-condition">
      <legend>{t('triggerInspector.dateTime')}</legend>
      <div className="weekday-options">
        {weekdayOptions.map((value) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={(temporal.weekdays ?? []).includes(value)}
              onChange={(event) =>
                update({
                  weekdays: event.target.checked
                    ? [...(temporal.weekdays ?? []), value]
                    : (temporal.weekdays ?? []).filter((weekday) => weekday !== value),
                })
              }
            />
            {t(`triggerInspector.weekday.${value}`)}
          </label>
        ))}
      </div>
      {(temporal.dates ?? []).map((date, index) => (
        <div className="temporal-row" key={`date-${index}`}>
          <input
            aria-label={t('triggerInspector.allowedDate', { number: index + 1 })}
            type="date"
            value={date}
            onChange={(event) => {
              const dates = [...(temporal.dates ?? [])];
              dates[index] = event.target.value;
              update({ dates });
            }}
          />
          <button
            aria-label={t('triggerInspector.deleteAllowedDate', { number: index + 1 })}
            className="ghost danger"
            type="button"
            onClick={() => update({ dates: temporal.dates?.filter((_, item) => item !== index) })}
          >
            x
          </button>
        </div>
      ))}
      {(temporal.dateRanges ?? []).map((range, index) => (
        <div className="temporal-row" key={`range-${index}`}>
          <input
            aria-label={t('triggerInspector.dateRangeStart', { number: index + 1 })}
            type="date"
            value={range.startDate}
            onChange={(event) => {
              const dateRanges = [...(temporal.dateRanges ?? [])];
              dateRanges[index] = { ...range, startDate: event.target.value };
              update({ dateRanges });
            }}
          />
          <span>{t('triggerInspector.to')}</span>
          <input
            aria-label={t('triggerInspector.dateRangeEnd', { number: index + 1 })}
            type="date"
            value={range.endDate}
            onChange={(event) => {
              const dateRanges = [...(temporal.dateRanges ?? [])];
              dateRanges[index] = { ...range, endDate: event.target.value };
              update({ dateRanges });
            }}
          />
          <button
            aria-label={t('triggerInspector.deleteDateRange', { number: index + 1 })}
            className="ghost danger"
            type="button"
            onClick={() =>
              update({ dateRanges: temporal.dateRanges?.filter((_, item) => item !== index) })
            }
          >
            x
          </button>
        </div>
      ))}
      {(temporal.timeSlots ?? []).map((slot, index) => (
        <div className="temporal-row" key={`slot-${index}`}>
          <input
            aria-label={t('triggerInspector.timeSlotStart', { number: index + 1 })}
            type="time"
            value={slot.startTime}
            onChange={(event) => {
              const timeSlots = [...(temporal.timeSlots ?? [])];
              timeSlots[index] = { ...slot, startTime: event.target.value };
              update({ timeSlots });
            }}
          />
          <span>{t('triggerInspector.to')}</span>
          <input
            aria-label={t('triggerInspector.timeSlotEnd', { number: index + 1 })}
            type="time"
            value={slot.endTime}
            onChange={(event) => {
              const timeSlots = [...(temporal.timeSlots ?? [])];
              timeSlots[index] = { ...slot, endTime: event.target.value };
              update({ timeSlots });
            }}
          />
          <button
            aria-label={t('triggerInspector.deleteTimeSlot', { number: index + 1 })}
            className="ghost danger"
            type="button"
            onClick={() =>
              update({ timeSlots: temporal.timeSlots?.filter((_, item) => item !== index) })
            }
          >
            x
          </button>
        </div>
      ))}
      <div className="temporal-actions">
        <button
          className="secondary"
          type="button"
          onClick={() => update({ dates: [...(temporal.dates ?? []), defaultDate] })}
        >
          {t('triggerInspector.addDate')}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() =>
            update({
              dateRanges: [
                ...(temporal.dateRanges ?? []),
                { startDate: defaultDate, endDate: defaultDate },
              ],
            })
          }
        >
          {t('triggerInspector.addDateRange')}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() =>
            update({
              timeSlots: [...(temporal.timeSlots ?? []), { startTime: '09:00', endTime: '17:00' }],
            })
          }
        >
          {t('triggerInspector.addTimeSlot')}
        </button>
      </div>
    </fieldset>
  );
}
