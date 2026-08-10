import { useId } from 'react';

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
  const suggestionsId = useId();

  return (
    <label>
      Category
      <input
        aria-label="Category"
        value={category ?? ''}
        list={suggestions.length > 0 ? suggestionsId : undefined}
        maxLength={100}
        placeholder="Uncategorized"
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
      <small className="field-help">Choose an existing category or type a new one.</small>
    </label>
  );
}
