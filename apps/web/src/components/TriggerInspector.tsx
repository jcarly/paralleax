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
import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InspectorCommentSlot,
  type InspectorSemanticCommentProps,
} from '../features/comments/InspectorCommentField';
import { conditionUnavailableReasons, createTriggerCondition } from '../triggerConditionAuthoring';
import { describeTriggerCondition } from '../triggerConditionPresentation';
import { AddConditionControl, TriggerConditionFields } from './TriggerConditionEditor';
import { FieldHelpTooltip } from './FieldHelpTooltip';

export function TriggerInspector({
  story,
  interaction,
  trigger,
  onSaveTrigger,
  onDeleteTrigger,
  semanticCommentCounts,
  onOpenSemanticComments,
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
} & InspectorSemanticCommentProps) {
  const { t } = useTranslation();
  const groups = getTriggerConditionGroups(trigger);
  const [editingConditionKey, setEditingConditionKey] = useState<string | null>(null);
  const activeConditionRef = useRef<HTMLDivElement>(null);
  const pendingConditionFocusRef = useRef(false);

  useLayoutEffect(() => {
    if (!editingConditionKey || !pendingConditionFocusRef.current) return;
    const editor = activeConditionRef.current;
    pendingConditionFocusRef.current = false;
    (
      editor?.querySelector<HTMLElement>('select, input, textarea') ??
      editor?.querySelector<HTMLElement>('button:not(.condition-summary)')
    )?.focus();
  }, [editingConditionKey]);

  function saveGroups(conditionGroups: TriggerConditionGroup[]) {
    return onSaveTrigger(interaction.id, trigger.id, { conditionGroups });
  }

  function updateGroup(groupId: string, conditions: TriggerCondition[]) {
    return saveGroups(
      groups.map((group) => (group.id === groupId ? { ...group, conditions } : group)),
    );
  }

  function collapseWhenFocusLeaves(event: FocusEvent<HTMLDivElement>, conditionKey: string) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setEditingConditionKey((current) => (current === conditionKey ? null : current));
    }
  }

  function collapseOnEnter(event: KeyboardEvent<HTMLDivElement>, conditionKey: string) {
    if (event.key === 'Enter') {
      setEditingConditionKey((current) => (current === conditionKey ? null : current));
    }
  }

  return (
    <div>
      <div className="field-heading-with-help">
        <h3>{t('triggerInspector.title')}</h3>
        <FieldHelpTooltip
          label={t('triggerInspector.title')}
          help={t('triggerInspector.variantsHelp')}
        />
      </div>
      <InspectorCommentSlot
        slot={{ kind: 'section', section: 'conditions' }}
        label={t('triggerInspector.title')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        {groups.map((group, groupIndex) => (
          <div className="trigger-variant" key={group.id}>
            {groupIndex > 0 ? <div className="or-divider">{t('triggerInspector.or')}</div> : null}
            {groups.length > 1 ? (
              <div className="trigger-variant-header editor-heading-row">
                <button
                  aria-label={t('triggerInspector.deleteGroup')}
                  className="ghost danger trigger-variant-delete"
                  title={t('triggerInspector.deleteGroup')}
                  type="button"
                  onClick={() => void saveGroups(groups.filter(({ id }) => id !== group.id))}
                >
                  ×
                </button>
              </div>
            ) : null}
            <div className="conditions" role="group" aria-label={t('triggerInspector.title')}>
              {group.conditions.length === 0 ? (
                <p className="condition-empty" role="status">
                  {t('triggerInspector.noConditions')}
                </p>
              ) : null}
              {group.conditions.map((condition, index) => {
                const conditionKey = `${group.id}:${index}`;
                const isEditing = editingConditionKey === conditionKey;
                const description = describeTriggerCondition(story, condition, t);
                return (
                  <div
                    className="condition-row-wrap"
                    key={conditionKey}
                    ref={isEditing ? activeConditionRef : undefined}
                    onBlur={
                      isEditing
                        ? (event) => collapseWhenFocusLeaves(event, conditionKey)
                        : undefined
                    }
                    onKeyUp={
                      isEditing ? (event) => collapseOnEnter(event, conditionKey) : undefined
                    }
                  >
                    {index > 0 ? (
                      <div className="condition-connector" aria-label={t('triggerInspector.and')}>
                        {t('triggerInspector.and')}
                      </div>
                    ) : null}
                    <div className="condition">
                      {isEditing ? (
                        <div className="condition-fields">
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
                        </div>
                      ) : (
                        <button
                          aria-expanded={isEditing}
                          aria-label={`${t('triggerInspector.editCondition')}: ${description}`}
                          className="condition-summary"
                          data-testid="condition-summary"
                          type="button"
                          onClick={() => setEditingConditionKey(conditionKey)}
                        >
                          {description}
                        </button>
                      )}
                      <button
                        aria-label={t('triggerInspector.deleteCondition', { number: index + 1 })}
                        className="ghost danger"
                        type="button"
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
                  </div>
                );
              })}
            </div>
            <AddConditionControl
              unavailableReasons={conditionUnavailableReasons(story, interaction.id, t)}
              onAdd={(type) => {
                const condition = createTriggerCondition(story, interaction.id, type);
                if (!condition) return;
                const nextConditions = [...group.conditions, condition];
                pendingConditionFocusRef.current = true;
                setEditingConditionKey(`${group.id}:${nextConditions.length - 1}`);
                void updateGroup(group.id, nextConditions);
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
      </InspectorCommentSlot>
      <hr />
      <InspectorCommentSlot
        slot={{ kind: 'field', field: 'appearanceProbability' }}
        label={t('triggerInspector.appearanceProbability')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <div className="field">
          <div className="field-label-with-help">
            <span>{t('triggerInspector.appearanceProbability')}</span>
            <FieldHelpTooltip
              label={t('triggerInspector.appearanceProbability')}
              help={t('triggerInspector.appearanceProbabilityHelp')}
            />
          </div>
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
        </div>
      </InspectorCommentSlot>
      <InspectorCommentSlot
        slot={{ kind: 'field', field: 'timer' }}
        label={t('triggerInspector.timer')}
        semanticCommentCounts={semanticCommentCounts}
        onOpenSemanticComments={onOpenSemanticComments}
      >
        <div className="field">
          <div className="field-label-with-help">
            <span>{t('triggerInspector.timer')}</span>
            <FieldHelpTooltip
              label={t('triggerInspector.timer')}
              help={t('triggerInspector.timerHelp')}
            />
          </div>
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
        </div>
      </InspectorCommentSlot>
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
