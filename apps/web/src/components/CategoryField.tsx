import { useId } from 'react';
import { useTranslation } from 'react-i18next';

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

  return (
    <label>
      {t('inspector.category')}
      <input
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
      <small className="field-help">{t('inspector.categoryHelp')}</small>
    </label>
  );
}
