import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  changeInterfaceLanguage,
  languageEndonyms,
  normalizeLanguage,
  supportedLanguages,
  type SupportedLanguage,
} from '../i18n';

interface LanguageOptionsProps {
  id: string;
  language: SupportedLanguage;
  label: string;
  open: boolean;
  onSelect: (language: SupportedLanguage) => void;
}

function useLanguageOptionsDismissal(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  rootRef: RefObject<HTMLDivElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, setOpen, rootRef, triggerRef]);
}

function LanguageOptions({ id, language, label, open, onSelect }: LanguageOptionsProps) {
  return (
    <fieldset id={id} className="language-switcher-options" hidden={!open}>
      <legend className="sr-only">{label}</legend>
      {supportedLanguages.map((supportedLanguage) => (
        <label className="language-switcher-option" key={supportedLanguage}>
          <input
            type="radio"
            name={`interface-language-${id}`}
            value={supportedLanguage}
            checked={language === supportedLanguage}
            onChange={() => onSelect(supportedLanguage)}
          />
          <span className="language-switcher-option-code">{supportedLanguage}</span>{' '}
          <span lang={supportedLanguage}>{languageEndonyms[supportedLanguage]}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const optionsId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useLanguageOptionsDismissal(isOpen, setIsOpen, rootRef, triggerRef);

  const chooseLanguage = (selectedLanguage: SupportedLanguage) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    void changeInterfaceLanguage(selectedLanguage);
  };

  return (
    <div ref={rootRef} className={`language-switcher ${className}`.trim()}>
      <button
        ref={triggerRef}
        className="language-switcher-toggle"
        type="button"
        aria-label={`${t('language.label')} (${language})`}
        aria-expanded={isOpen}
        aria-controls={optionsId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{language}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <LanguageOptions
        id={optionsId}
        language={language}
        label={t('language.label')}
        open={isOpen}
        onSelect={chooseLanguage}
      />
    </div>
  );
}
