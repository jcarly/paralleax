import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

export const supportedLanguages = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languageStorageKey = 'paralleax.interface-language';

export function normalizeLanguage(value: string | null | undefined): SupportedLanguage | null {
  const language = value?.trim().toLowerCase().split('-')[0];
  return supportedLanguages.find((candidate) => candidate === language) ?? null;
}

export function detectInterfaceLanguage(): SupportedLanguage {
  try {
    const storedLanguage = normalizeLanguage(window.localStorage.getItem(languageStorageKey));
    if (storedLanguage) return storedLanguage;
  } catch {
    // The interface still follows the browser when storage is unavailable.
  }

  for (const language of globalThis.navigator?.languages ?? []) {
    const supportedLanguage = normalizeLanguage(language);
    if (supportedLanguage) return supportedLanguage;
  }

  return normalizeLanguage(globalThis.navigator?.language) ?? 'en';
}

function applyLanguage(language: string) {
  const supportedLanguage = normalizeLanguage(language) ?? 'en';
  document.documentElement.lang = supportedLanguage;
  try {
    window.localStorage.setItem(languageStorageKey, supportedLanguage);
  } catch {
    // A blocked preference must not prevent the interface from changing language.
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectInterfaceLanguage(),
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  load: 'languageOnly',
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

applyLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on('languageChanged', applyLanguage);

export { i18n };
