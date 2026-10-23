import { useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

/** Shared rename contract: Enter/blur saves, Escape restores the focus-time name. */
export function EntityNameInput({
  value,
  onChange,
  onCommit,
  onComplete,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & {
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => Promise<boolean | void>;
  onComplete?: (restoreFocus: boolean) => void;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  const original = useRef(value);
  const cancelled = useRef(false);
  const saving = useRef(false);
  const sessionActive = useRef(false);
  const enterPressed = useRef(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function commit(input: HTMLInputElement) {
    const restoreFocus = enterPressed.current;
    enterPressed.current = false;
    if (cancelled.current || saving.current) return;
    const name = input.value.trim();
    if (!name) {
      setError(t('rename.empty'));
      input.focus();
      return;
    }
    if (name === original.current) {
      sessionActive.current = false;
      onComplete?.(restoreFocus);
      return;
    }
    saving.current = true;
    setPending(true);
    try {
      const result = await onCommit(name);
      if (result === false) throw new Error('Save failed');
      onChange(name);
      original.current = name;
      sessionActive.current = false;
      setError('');
      onComplete?.(restoreFocus);
    } catch {
      setError(t('rename.failed'));
      input.focus();
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <input
        {...inputProps}
        value={value}
        readOnly={pending || inputProps.readOnly}
        aria-busy={pending || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : inputProps['aria-describedby']}
        onFocus={(event) => {
          if (!sessionActive.current) original.current = value;
          sessionActive.current = true;
          cancelled.current = false;
          inputProps.onFocus?.(event);
        }}
        onChange={(event) => {
          setError('');
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          void commit(event.currentTarget);
        }}
        onKeyDown={(event) => {
          inputProps.onKeyDown?.(event);
          if (saving.current) return;
          if (event.defaultPrevented || event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelled.current = true;
            sessionActive.current = false;
            onChange(original.current);
            setError('');
            event.currentTarget.blur();
            onComplete?.(true);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            enterPressed.current = true;
            event.currentTarget.blur();
          }
        }}
      />
      {error ? (
        <span id={errorId} role="alert" className="error">
          {error}
        </span>
      ) : null}
    </>
  );
}
