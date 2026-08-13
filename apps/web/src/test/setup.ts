import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { i18n, languageStorageKey } from '../i18n';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  window.localStorage.removeItem(languageStorageKey);
});
