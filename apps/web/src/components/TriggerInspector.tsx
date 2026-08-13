import type {
  Interaction,
  Story,
  TemporalCondition,
  TriggerCondition,
  Weekday,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { getRelatedTriggerVariantIds } from '../storyGraph';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  onSaveTrigger,
  onCreateTriggerVariant,
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

  return (
    <div>
      <h3>{t('triggerInspector.title')}</h3>
      {hasOrVariants ? <p className="hint">{t('triggerInspector.variantsHelp')}</p> : null}
      {variants.map((variant, variantIndex) => (
        <div className="trigger-variant" key={variant.id}>
          {variantIndex > 0 ? <div className="or-divider">{t('triggerInspector.or')}</div> : null}
          {hasOrVariants ? (
            <h4>{t('triggerInspector.group', { number: variantIndex + 1 })}</h4>
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
          <button
            className="secondary"
            disabled={story.interactions.length < 2}
            onClick={() => {
              const candidate = story.interactions.find((item) => item.id !== interaction.id);
              if (candidate) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { interactionId: candidate.id, hasBeenVisited: true },
                ]);
              }
            }}
          >
            {t('triggerInspector.addInteraction')}
          </button>
          <button
            className="secondary"
            disabled={(story.locations?.length ?? 0) === 0}
            onClick={() => {
              const location = story.locations?.[0];
              if (location) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { locationId: location.id, isCurrentLocation: true },
                ]);
              }
            }}
          >
            {t('triggerInspector.addLocation')}
          </button>
          <button
            className="secondary"
            disabled={(story.characters?.length ?? 0) === 0}
            onClick={() => {
              const character = story.characters?.[0];
              if (character) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { characterId: character.id, isPresent: true },
                ]);
              }
            }}
          >
            {t('triggerInspector.addCharacter')}
          </button>
          <button
            className="secondary"
            disabled={stats.length === 0}
            onClick={() => {
              const stat = stats[0];
              if (stat) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { statId: stat.id, operator: 'gte', value: stat.initialValue },
                ]);
              }
            }}
          >
            {t('triggerInspector.addStat')}
          </button>
          <button
            className="secondary"
            disabled={(story.itemDefinitions?.length ?? 0) === 0}
            onClick={() => {
              const definition = story.itemDefinitions?.[0];
              if (definition) {
                void updateTrigger(variant, variant.inputInteractionIds, [
                  ...variant.conditions,
                  { itemDefinitionId: definition.id, isOwned: true },
                ]);
              }
            }}
          >
            {t('triggerInspector.addItem')}
          </button>
          <button
            className="secondary"
            onClick={() => {
              void updateTrigger(variant, variant.inputInteractionIds, [
                ...variant.conditions,
                { temporal: { weekdays: ['monday'] } },
              ]);
            }}
          >
            {t('triggerInspector.addDateTime')}
          </button>
          {hasOrVariants ? (
            <button
              className="ghost danger"
              onClick={() => void onDeleteTrigger(interaction.id, variant.id)}
            >
              {t('triggerInspector.deleteGroup')}
            </button>
          ) : null}
        </div>
      ))}
      <button
        className="secondary"
        disabled={trigger.inputInteractionIds.length === 0 || story.interactions.length < 2}
        onClick={() => void onCreateTriggerVariant(interaction.id, trigger.id)}
      >
        {t('triggerInspector.addGroup')}
      </button>
      <hr />
      {hasOrVariants ? (
        <button
          className="danger"
          onClick={() => void onDeleteTriggerVariants(interaction.id, variantIds)}
        >
          {t('triggerInspector.deleteAllGroups')}
        </button>
      ) : (
        <button className="danger" onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}>
          {t('triggerInspector.deleteTrigger')}
        </button>
      )}
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
