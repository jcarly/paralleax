import { useState } from 'react';
import {
  getStatTargets,
  getStatValueType,
  inferExpressionType,
  variableReference,
  type StatValueType,
  type Story,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { VariablePicker } from './VariablePicker';

export function ExpressionEditor({
  story,
  value,
  onChange,
  onBlur,
  expectedType,
}: {
  story: Story;
  value: string;
  onChange: (nextValue: string) => void;
  onBlur?: (nextValue: string) => void;
  expectedType?: StatValueType;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState({ source: value, draft: value });
  const draft = editing.source === value ? editing.draft : value;
  const setDraft = (nextValue: string) => setEditing({ source: value, draft: nextValue });
  const targets = getStatTargets(story);
  const isValidExpression = (expression: string) => {
    const resultType = inferExpressionType(expression, ({ id, itemId }) => {
      const target = targets.find(
        (candidate) => candidate.assignment.id === id && candidate.itemId === itemId,
      );
      return target?.definition ? getStatValueType(target.definition) : undefined;
    });
    return resultType !== undefined && (!expectedType || resultType === expectedType);
  };
  const isValid = isValidExpression(draft);

  return (
    <div className="expression-editor-field">
      <textarea
        aria-label={t('interactionInspector.variableEffectExpression')}
        aria-invalid={!isValid}
        maxLength={4000}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          if (isValidExpression(event.target.value)) onBlur?.(event.target.value);
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
            if (isValidExpression(nextValue)) onBlur?.(nextValue);
            setPickerOpen(false);
          }}
        />
      ) : null}
      {!isValid ? <small role="alert">{t('interactionInspector.invalidExpression')}</small> : null}
    </div>
  );
}
