import type { StatValue, StatValueType } from '@paralleax/shared';

export function StatValueField({
  ariaLabel,
  valueType,
  value,
  onChange,
  onBlur,
}: {
  ariaLabel: string;
  valueType: StatValueType;
  value: StatValue;
  onChange: (value: StatValue) => void;
  onBlur?: (value: StatValue) => void;
}) {
  if (valueType === 'boolean') {
    return (
      <select
        className="form-control form-control--compact"
        aria-label={ariaLabel}
        value={String(value)}
        onChange={(event) => {
          const next = event.target.value === 'true';
          onChange(next);
          onBlur?.(next);
        }}
      >
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    );
  }

  return (
    <input
      className="form-control form-control--compact"
      aria-label={ariaLabel}
      type={valueType === 'number' ? 'number' : 'text'}
      value={String(value)}
      onChange={(event) =>
        onChange(valueType === 'number' ? Number(event.target.value) : event.target.value)
      }
      onBlur={(event) =>
        onBlur?.(valueType === 'number' ? Number(event.target.value) : event.target.value)
      }
    />
  );
}
