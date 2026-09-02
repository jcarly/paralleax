import {
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  type Interaction,
  type Story,
  type TriggerCondition,
  type TriggerConditionGroup,
  type UpdateTriggerInput,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { conditionUnavailableReasons, createTriggerCondition } from '../triggerConditionAuthoring';
import { AddConditionControl, TriggerConditionFields } from './TriggerConditionEditor';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  onSaveTrigger,
  onDeleteTrigger,
}: {
  story: Story;
  interaction: Interaction;
  trigger: Interaction['triggers'][number];
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    input: UpdateTriggerInput,
  ) => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const groups = getTriggerConditionGroups(trigger);

  function saveGroups(conditionGroups: TriggerConditionGroup[]) {
    return onSaveTrigger(interaction.id, trigger.id, { conditionGroups });
  }

  function updateGroup(groupId: string, conditions: TriggerCondition[]) {
    return saveGroups(
      groups.map((group) => (group.id === groupId ? { ...group, conditions } : group)),
    );
  }

  return (
    <div>
      <h3>{t('triggerInspector.title')}</h3>
      <label className="field">
        <span>{t('triggerInspector.appearanceProbability')}</span>
        <div className="trigger-probability-field">
          <input
            aria-label={t('triggerInspector.appearanceProbability')}
            defaultValue={getTriggerAppearanceProbability(trigger)}
            key={`${trigger.id}:${getTriggerAppearanceProbability(trigger)}`}
            max={100}
            min={0}
            type="number"
            onBlur={(event) => {
              const value = Math.round(
                Math.min(100, Math.max(0, Number(event.currentTarget.value))),
              );
              event.currentTarget.value = String(value);
              if (value === getTriggerAppearanceProbability(trigger)) return;
              void onSaveTrigger(interaction.id, trigger.id, {
                appearanceProbability: value,
              });
            }}
          />
          <span aria-hidden="true">%</span>
        </div>
        <small>{t('triggerInspector.appearanceProbabilityHelp')}</small>
      </label>
      <label className="field">
        <span>{t('triggerInspector.timer')}</span>
        <div className="trigger-probability-field">
          <input
            aria-label={t('triggerInspector.timer')}
            defaultValue={getTriggerTimerSeconds(trigger) ?? ''}
            key={`${trigger.id}:timer:${getTriggerTimerSeconds(trigger) ?? 'none'}`}
            min={0}
            placeholder="—"
            step={1}
            type="number"
            onBlur={(event) => {
              const rawValue = event.currentTarget.value.trim();
              const value = rawValue
                ? Math.round(Math.min(2_147_483_647, Math.max(0, Number(rawValue))))
                : null;
              event.currentTarget.value = value === null ? '' : String(value);
              if (value === getTriggerTimerSeconds(trigger)) return;
              void onSaveTrigger(interaction.id, trigger.id, { timerSeconds: value });
            }}
          />
          <span aria-hidden="true">s</span>
        </div>
        <small>{t('triggerInspector.timerHelp')}</small>
      </label>
      <p className="hint">{t('triggerInspector.variantsHelp')}</p>
      {groups.map((group, groupIndex) => (
        <div className="trigger-variant" key={group.id}>
          {groupIndex > 0 ? <div className="or-divider">{t('triggerInspector.or')}</div> : null}
          <div className="trigger-variant-header">
            <h4>{t('triggerInspector.group', { number: groupIndex + 1 })}</h4>
            {groups.length > 1 ? (
              <button
                aria-label={t('triggerInspector.deleteGroup')}
                className="ghost danger trigger-variant-delete"
                title={t('triggerInspector.deleteGroup')}
                type="button"
                onClick={() => void saveGroups(groups.filter(({ id }) => id !== group.id))}
              >
                ×
              </button>
            ) : null}
          </div>
          <div className="conditions">
            {group.conditions.map((condition, index) => (
              <div className="condition" key={`${group.id}-${index}`}>
                <TriggerConditionFields
                  condition={condition}
                  currentInteractionId={interaction.id}
                  story={story}
                  onChange={(nextCondition) => {
                    const next = [...group.conditions];
                    next[index] = nextCondition;
                    void updateGroup(group.id, next);
                  }}
                />
                <button
                  className="ghost danger"
                  onClick={() =>
                    void updateGroup(
                      group.id,
                      group.conditions.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <AddConditionControl
            unavailableReasons={conditionUnavailableReasons(story, interaction.id, t)}
            onAdd={(type) => {
              const condition = createTriggerCondition(story, interaction.id, type);
              if (condition) void updateGroup(group.id, [...group.conditions, condition]);
            }}
          />
        </div>
      ))}
      <button
        className="trigger-add-group"
        type="button"
        onClick={() =>
          void saveGroups([
            ...groups,
            {
              id:
                globalThis.crypto?.randomUUID?.() ??
                `condition-group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              conditions: [],
            },
          ])
        }
      >
        <span aria-hidden="true" className="trigger-add-group-icon">
          +
        </span>
        <span>{t('triggerInspector.addGroup')}</span>
      </button>
      <hr />
      <button
        className="danger trigger-delete-action"
        onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}
      >
        {t('triggerInspector.deleteTrigger')}
      </button>
    </div>
  );
}
