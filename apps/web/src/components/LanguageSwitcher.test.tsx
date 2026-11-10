import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

function expectLanguageOptions() {
  expect(screen.getAllByRole('radio').map((option) => option.getAttribute('value'))).toEqual([
    'en',
    'fr',
    'it',
  ]);
}

afterEach(() => cleanup());
beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher language codes', () => {
  it('normalizes supported regional language codes', () => {
    expect(normalizeLanguage('fr-FR')).toBe('fr');
    expect(normalizeLanguage('EN-us')).toBe('en');
    expect(normalizeLanguage('it-IT')).toBe('it');
    expect(normalizeLanguage('de-DE')).toBeNull();
  });
});

describe('LanguageSwitcher language changes', () => {
  it('shows the ISO code and changes the interface language to French', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText('Stories')).toBeInTheDocument();
    const englishButton = screen.getByRole('button', { name: 'Language (en)' });
    expect(englishButton).toHaveTextContent('en');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(englishButton);
    expectLanguageOptions();
    await user.click(screen.getByRole('radio', { name: 'fr Français' }));

    expect(await screen.findByText('Histoires')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Langue (fr)' })).toHaveTextContent('fr');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(languageStorageKey)).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');

    await i18n.changeLanguage('en');
  });

  it('changes the interface language to Italian and persists the preference', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Language (en)' }));
    expectLanguageOptions();
    await user.click(screen.getByRole('radio', { name: 'it Italiano' }));

    expect(await screen.findByText('Storie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lingua (it)' })).toHaveTextContent('it');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(languageStorageKey)).toBe('it');
    expect(document.documentElement.lang).toBe('it');

    await i18n.changeLanguage('en');
  });
});

describe('LanguageSwitcher options', () => {
  it('opens the options on click and dismisses them with Escape or an outside click', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const toggle = screen.getByRole('button', { name: 'Language (en)' });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expectLanguageOptions();

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await user.click(toggle);
    await user.click(screen.getByText('Stories'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
