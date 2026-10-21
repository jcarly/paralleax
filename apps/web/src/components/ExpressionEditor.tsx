import { useState } from 'react';
import { parseExpression, variableReference, type Story } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { VariablePicker } from './VariablePicker';

export function ExpressionEditor({
  story,
  value,
  onChange,
  onBlur,
}: {
  story: Story;
  value: string;
  onChange: (nextValue: string) => void;
  onBlur?: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const isValid = draft.trim() === '' || Boolean(parseExpression(draft));

  return (
    <div className="expression-editor-field">
      <textarea
        aria-label={t('interactionInspector.variableEffectExpression')}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          onBlur?.(event.target.value);
        }}
      />
      <button type="button" onClick={() => setPickerOpen((open) => !open)}>
        {t('interactionInspector.insertVariableExpression')}
      </button>
      {pickerOpen ? (
        <VariablePicker
          story={story}
          onSelect={({ target }) => {
            const reference = variableReference(target.assignment.id, target.itemId);
            const trimmed = draft.trim();
            const nextValue = trimmed
              ? `${trimmed}${/[\s+\-*/<>=!()]+$/.test(trimmed) ? '' : ' '}${reference}`
              : reference;
            setDraft(nextValue);
            onChange(nextValue);
            setPickerOpen(false);
          }}
        />
      ) : null}
      {!isValid ? <small>{t('interactionInspector.invalidExpression')}</small> : null}
    </div>
  );
}
