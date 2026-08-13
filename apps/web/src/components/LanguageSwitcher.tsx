import { useTranslation } from 'react-i18next';
import { normalizeLanguage, supportedLanguages, type SupportedLanguage } from '../i18n';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const language = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';

  return (
    <label className={`language-switcher ${className}`.trim()}>
      <span className="sr-only">{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        value={language}
        onChange={(event) => void i18n.changeLanguage(event.target.value as SupportedLanguage)}
      >
        {supportedLanguages.map((supportedLanguage) => (
          <option key={supportedLanguage} value={supportedLanguage}>
            {supportedLanguage === 'en' ? t('language.english') : t('language.french')}
          </option>
        ))}
      </select>
    </label>
  );
}
