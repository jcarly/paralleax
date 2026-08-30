import type { Story, TriggerCondition } from '@paralleax/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { conditionUnavailableReasons, createTriggerCondition } from '../triggerConditionAuthoring';
import { AddConditionControl, TriggerConditionFields } from './TriggerConditionEditor';
import { RichTextEditorDialog } from './RichTextEditorDialog';

export function RichTextConditionDialog({
  story,
  currentInteractionId,
  initialCondition,
  mode,
  onCancel,
  onConfirm,
}: {
  story: Story;
  currentInteractionId: string;
  initialCondition?: TriggerCondition;
  mode: 'create' | 'edit';
  onCancel: () => void;
  onConfirm: (condition: TriggerCondition) => void;
}) {
  const { t } = useTranslation();
  const [condition, setCondition] = useState(initialCondition);
  const isEditing = mode === 'edit';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (condition) onConfirm(condition);
  }

  return (
    <RichTextEditorDialog
      className="rich-text-condition-dialog"
      closeLabel={t('richText.closeConditionDialog')}
      description={t(
        isEditing ? 'richText.editConditionDescription' : 'richText.addConditionDescription',
      )}
      title={t(isEditing ? 'richText.editConditionTitle' : 'richText.addConditionTitle')}
      onCancel={onCancel}
    >
      <form className="rich-text-condition-form" onSubmit={submit}>
        {condition ? (
          <div className="condition rich-text-condition-fields">
            <TriggerConditionFields
              condition={condition}
              currentInteractionId={currentInteractionId}
              story={story}
              onChange={setCondition}
            />
          </div>
        ) : (
          <AddConditionControl
            initiallyOpen
            unavailableReasons={conditionUnavailableReasons(story, currentInteractionId, t)}
            onAdd={(type) =>
              setCondition(createTriggerCondition(story, currentInteractionId, type))
            }
          />
        )}
        <div className="modal-dialog-actions rich-text-dialog-actions">
          <button className="ghost" type="button" onClick={onCancel}>
            {t('richText.cancelCondition')}
          </button>
          <button disabled={!condition} type="submit">
            {t(isEditing ? 'richText.updateCondition' : 'richText.insertCondition')}
          </button>
        </div>
      </form>
    </RichTextEditorDialog>
  );
}
