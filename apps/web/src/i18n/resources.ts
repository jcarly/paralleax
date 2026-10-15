import { englishTranslation } from './english';
import { frenchTranslation } from './french';

export const resources = {
  en: { translation: englishTranslation },
  fr: { translation: frenchTranslation },
} as const;
