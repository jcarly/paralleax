import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n, languageStorageKey, normalizeLanguage } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

function Harness() {
  const { t } = useTranslation();
  return (
    <>
      <LanguageSwitcher />
      <p>{t('shell.stories')}</p>
    </>
  );
}

describe('LanguageSwitcher', () => {
  afterEach(() => cleanup());

  it('normalizes supported regional language codes', () => {
    expect(normalizeLanguage('fr-FR')).toBe('fr');
    expect(normalizeLanguage('EN-us')).toBe('en');
    expect(normalizeLanguage('de-DE')).toBeNull();
  });

  it('changes the interface language and persists the preference', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('Stories')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr');

    expect(screen.getByText('Histoires')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Langue' })).toHaveValue('fr');
    expect(window.localStorage.getItem(languageStorageKey)).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');

    await i18n.changeLanguage('en');
  });
});
