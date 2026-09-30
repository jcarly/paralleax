import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api, type AuthUser } from '../api';
import { apiErrorMessage } from '../apiErrorMessages';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import './ProductPages.css';

export type AccountAction = 'verify-email' | 'reset-password' | 'request-password-reset';

export function AccountActionPage({
  action,
  onAuthenticated,
  onBackToSignIn,
}: {
  action: AccountAction;
  onAuthenticated: (user: AuthUser) => void;
  onBackToSignIn: () => void;
}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const token = searchParams.get('token') ?? '';
  const passwordsMatch = password === confirmation;
  const canSubmit =
    !pending &&
    (action === 'request-password-reset'
      ? email.includes('@')
      : action === 'reset-password'
        ? token.length >= 32 && password.length >= 8 && passwordsMatch
        : token.length >= 32);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      setPending(true);
      setError('');
      if (action === 'verify-email') {
        onAuthenticated(await api.verifyEmail(token));
        return;
      }
      if (action === 'reset-password') {
        onAuthenticated(await api.resetPassword(token, password));
        return;
      }
      await api.requestPasswordReset(email);
      setComplete(true);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, t('auth.failed')));
    } finally {
      setPending(false);
    }
  }

  const key =
    action === 'verify-email' ? 'verify' : action === 'reset-password' ? 'reset' : 'requestReset';

  return (
    <main className="product-page auth-layout">
      <section className="auth-showcase">
        <div className="product-brand" aria-label="Paralleax">
          <span aria-hidden="true">P</span>
          <b>Paralleax</b>
        </div>
        <div className="auth-message">
          <span className="product-eyebrow">{t('auth.action.eyebrow')}</span>
          <h1>{t(`auth.action.${key}.showcaseTitle`)}</h1>
          <p>{t(`auth.action.${key}.showcaseDescription`)}</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <LanguageSwitcher className="language-switcher-auth" />
          <span className="product-eyebrow">{t(`auth.action.${key}.eyebrow`)}</span>
          <h2>{t(`auth.action.${key}.title`)}</h2>
          <p>
            {complete
              ? t('auth.action.requestReset.complete')
              : t(`auth.action.${key}.description`)}
          </p>
          {complete ? (
            <button className="product-primary auth-submit" type="button" onClick={onBackToSignIn}>
              {t('auth.action.backToSignIn')}
            </button>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {action === 'request-password-reset' ? (
                <label className="product-field">
                  <span>{t('auth.email')}</span>
                  <input
                    autoComplete="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    required
                  />
                </label>
              ) : null}
              {action === 'reset-password' ? (
                <>
                  <label className="product-field">
                    <span>{t('auth.password')}</span>
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={t('auth.newPasswordPlaceholder')}
                      minLength={8}
                      required
                    />
                  </label>
                  <label className="product-field">
                    <span>{t('auth.confirmPassword')}</span>
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      required
                    />
                    {confirmation && !passwordsMatch ? (
                      <small className="field-error">{t('auth.passwordsDoNotMatch')}</small>
                    ) : null}
                  </label>
                </>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="auth-verification-actions">
                <button className="product-primary auth-submit" type="submit" disabled={!canSubmit}>
                  {pending ? t('auth.pending') : t(`auth.action.${key}.submit`)}
                </button>
                <button className="product-secondary" type="button" onClick={onBackToSignIn}>
                  {t('auth.action.backToSignIn')}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
