import { useTranslation } from 'react-i18next';
import {
  changeInterfaceLanguage,
  languageEndonyms,
  normalizeLanguage,
  supportedLanguages,
} from '../i18n';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  return (
    <label className={`language-switcher ${className}`.trim()}>
      <span className="sr-only">{t('language.label')}</span>
      {/* eslint-disable-next-line design-system/require-shared-form-control -- the header language selector keeps its compact toolbar treatment */}
      <select
        aria-label={t('language.label')}
        value={language}
        onChange={(event) => void changeInterfaceLanguage(event.target.value)}
      >
        {supportedLanguages.map((supportedLanguage) => (
          <option key={supportedLanguage} value={supportedLanguage}>
            {languageEndonyms[supportedLanguage]}
          </option>
        ))}
      </select>
    </label>
  );
}
