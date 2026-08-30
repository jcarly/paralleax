import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { getRelatedTriggerVariantIds } from '../storyGraph';
import { conditionUnavailableReasons, createTriggerCondition } from '../triggerConditionAuthoring';
import { AddConditionControl, TriggerConditionFields } from './TriggerConditionEditor';

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
              <div className="condition" key={`${variant.id}-${index}`}>
                <TriggerConditionFields
                  condition={condition}
                  currentInteractionId={interaction.id}
                  story={story}
                  onChange={(nextCondition) => {
                    const next = [...variant.conditions];
                    next[index] = nextCondition;
                    void updateTrigger(variant, variant.inputInteractionIds, next);
                  }}
                />
                <button
                  className="ghost danger"
                  onClick={() =>
                    void updateTrigger(
                      variant,
                      variant.inputInteractionIds,
                      variant.conditions.filter((_, itemIndex) => itemIndex !== index),
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
            unavailableReasons={conditionUnavailableReasons(story, interaction.id, t)}
            onAdd={(type) => {
              const condition = createTriggerCondition(story, interaction.id, type);
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
