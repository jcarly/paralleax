import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldHelpTooltip } from './FieldHelpTooltip';

export function CategoryField({
  category,
  suggestions = [],
  onChange,
  onBlur,
}: {
  category?: string;
  suggestions?: string[];
  onChange: (category: string) => void;
  onBlur: (category: string) => void;
}) {
  const { t } = useTranslation();
  const suggestionsId = useId();
  const inputId = useId();

  return (
    <div className="field">
      <div className="field-label-with-help">
        <label htmlFor={inputId}>{t('inspector.category')}</label>
        <FieldHelpTooltip label={t('inspector.category')} help={t('inspector.categoryHelp')} />
      </div>
      <input
        id={inputId}
        aria-label={t('inspector.category')}
        value={category ?? ''}
        list={suggestions.length > 0 ? suggestionsId : undefined}
        maxLength={100}
        placeholder={t('inspector.uncategorized')}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          const nextCategory = event.target.value.trim();
          onChange(nextCategory);
          onBlur(nextCategory);
        }}
      />
      {suggestions.length > 0 ? (
        <datalist id={suggestionsId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
