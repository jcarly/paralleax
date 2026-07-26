import type {
  Interaction,
  Story,
  TemporalCondition,
  TriggerCondition,
  Weekday,
} from '@paralleax/shared';
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
  const variantIds = getRelatedTriggerVariantIds(interaction, trigger);
  const variants = interaction.triggers.filter((item) => variantIds.includes(item.id));
  const hasOrVariants = variants.length > 1;
  const stats = (story.characters ?? []).flatMap((character) =>
    (character.stats ?? []).map((stat) => ({
      ...stat,
      label: `${character.name} — ${
        story.statDefinitions?.find(({ id }) => id === stat.statDefinitionId)?.name ??
        'Unknown stat'
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
      <h3>Path conditions</h3>
      {hasOrVariants ? (
        <p className="hint">This visual trigger contains alternative condition groups.</p>
      ) : null}
      {variants.map((variant, variantIndex) => (
        <div className="trigger-variant" key={variant.id}>
          {variantIndex > 0 ? <div className="or-divider">OR</div> : null}
          {hasOrVariants ? <h4>Condition group {variantIndex + 1}</h4> : null}
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
                        : 'statId' in condition
                          ? condition.statId
                          : 'time'
                }-${index}`}
              >
                {'interactionId' in condition ? (
                  <>
                    <select
                      aria-label="Condition interaction"
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
                      aria-label="Interaction condition operator"
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
                      <option value="visited">has been visited</option>
                      <option value="not-visited">has not been visited</option>
                    </select>
                  </>
                ) : 'locationId' in condition ? (
                  <>
                    <select
                      aria-label="Condition location"
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
                      aria-label="Location condition operator"
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
                      <option value="current">is the current location</option>
                      <option value="not-current">is not the current location</option>
                    </select>
                  </>
                ) : 'characterId' in condition ? (
                  <>
                    <select
                      aria-label="Condition character"
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
                      aria-label="Character condition operator"
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
                      <option value="present">is present</option>
                      <option value="absent">is absent</option>
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
                      aria-label="Condition stat"
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
                      aria-label="Stat condition operator"
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
                      <option value="eq">equals</option>
                      <option value="lt">is less than</option>
                      <option value="lte">is at most</option>
                      <option value="gt">is greater than</option>
                      <option value="gte">is at least</option>
                    </select>
                    <input
                      aria-label="Stat condition value"
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
            Add interaction condition
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
            Add location condition
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
            Add character condition
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
            Add stat condition
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
            Add date/time condition
          </button>
          {hasOrVariants ? (
            <button
              className="ghost danger"
              onClick={() => void onDeleteTrigger(interaction.id, variant.id)}
            >
              Delete this OR group
            </button>
          ) : null}
        </div>
      ))}
      <button
        className="secondary"
        disabled={trigger.inputInteractionIds.length === 0 || story.interactions.length < 2}
        onClick={() => void onCreateTriggerVariant(interaction.id, trigger.id)}
      >
        Add OR condition group
      </button>
      <hr />
      {hasOrVariants ? (
        <button
          className="danger"
          onClick={() => void onDeleteTriggerVariants(interaction.id, variantIds)}
        >
          Delete all OR groups
        </button>
      ) : (
        <button className="danger" onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}>
          Delete trigger
        </button>
      )}
    </div>
  );
}

const weekdayOptions: Array<{ value: Weekday; label: string }> = [
  { value: 'monday', label: 'Mon' },
  { value: 'tuesday', label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' },
  { value: 'friday', label: 'Fri' },
  { value: 'saturday', label: 'Sat' },
  { value: 'sunday', label: 'Sun' },
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
  const temporal = condition.temporal;
  const update = (patch: Partial<TemporalCondition['temporal']>) =>
    onChange({ temporal: { ...temporal, ...patch } });

  return (
    <fieldset className="temporal-condition">
      <legend>Date and time</legend>
      <div className="weekday-options">
        {weekdayOptions.map(({ value, label }) => (
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
            {label}
          </label>
        ))}
      </div>
      {(temporal.dates ?? []).map((date, index) => (
        <div className="temporal-row" key={`date-${index}`}>
          <input
            aria-label={`Allowed date ${index + 1}`}
            type="date"
            value={date}
            onChange={(event) => {
              const dates = [...(temporal.dates ?? [])];
              dates[index] = event.target.value;
              update({ dates });
            }}
          />
          <button
            aria-label={`Delete allowed date ${index + 1}`}
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
            aria-label={`Date range ${index + 1} start`}
            type="date"
            value={range.startDate}
            onChange={(event) => {
              const dateRanges = [...(temporal.dateRanges ?? [])];
              dateRanges[index] = { ...range, startDate: event.target.value };
              update({ dateRanges });
            }}
          />
          <span>to</span>
          <input
            aria-label={`Date range ${index + 1} end`}
            type="date"
            value={range.endDate}
            onChange={(event) => {
              const dateRanges = [...(temporal.dateRanges ?? [])];
              dateRanges[index] = { ...range, endDate: event.target.value };
              update({ dateRanges });
            }}
          />
          <button
            aria-label={`Delete date range ${index + 1}`}
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
            aria-label={`Time slot ${index + 1} start`}
            type="time"
            value={slot.startTime}
            onChange={(event) => {
              const timeSlots = [...(temporal.timeSlots ?? [])];
              timeSlots[index] = { ...slot, startTime: event.target.value };
              update({ timeSlots });
            }}
          />
          <span>to</span>
          <input
            aria-label={`Time slot ${index + 1} end`}
            type="time"
            value={slot.endTime}
            onChange={(event) => {
              const timeSlots = [...(temporal.timeSlots ?? [])];
              timeSlots[index] = { ...slot, endTime: event.target.value };
              update({ timeSlots });
            }}
          />
          <button
            aria-label={`Delete time slot ${index + 1}`}
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
          Add date
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
          Add date range
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
          Add time slot
        </button>
      </div>
    </fieldset>
  );
}
