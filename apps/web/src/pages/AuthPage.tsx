import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidUserDisplayName, normalizeUserDisplayName } from '@paralleax/shared';
import { api, type AuthUser } from '../api';
import { apiErrorMessage } from '../apiErrorMessages';
import { FieldHelpTooltip } from '../components/FieldHelpTooltip';
import './ProductPages.css';

export type AuthMode = 'login' | 'register';

export function AuthPage({
  onAuthenticated,
  notice = '',
  initialMode = 'login',
  onModeChange,
}: {
  onAuthenticated: (user: AuthUser) => void | Promise<void>;
  notice?: string;
  initialMode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [localMode, setLocalMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const mode = onModeChange ? initialMode : localMode;
  const isRegister = mode === 'register';
  const passwordsMatch = !isRegister || password === confirmation;
  const normalizedDisplayName = normalizeUserDisplayName(displayName);
  const canSubmit =
    email.includes('@') &&
    password.length >= 8 &&
    passwordsMatch &&
    (!isRegister || isValidUserDisplayName(normalizedDisplayName)) &&
    !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    try {
      setError('');
      setPending(true);
      if (isRegister) {
        const result = await api.register(email, password, normalizedDisplayName);
        if (result.verificationRequired) {
          setVerificationEmail(result.email);
        } else {
          await onAuthenticated(result.user);
        }
      } else {
        await onAuthenticated(await api.login(email, password));
      }
    } catch (caught) {
      setError(apiErrorMessage(caught, t, t('auth.failed')));
    } finally {
      setPending(false);
    }
  }

  async function switchMode() {
    const nextMode = isRegister ? 'login' : 'register';
    if (!onModeChange) {
      setLocalMode(nextMode);
    }
    setConfirmation('');
    setError('');
    setVerificationEmail('');
    try {
      await onModeChange?.(nextMode);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, t('auth.failed')));
    }
  }

  return (
    <main className="product-page auth-route">
      <section className="auth-panel">
        <div className="auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title">
            {verificationEmail
              ? t('auth.verification.title')
              : t(isRegister ? 'auth.register.title' : 'auth.login.title')}
          </h1>
          {verificationEmail || isRegister ? (
            <p>
              {verificationEmail
                ? t('auth.verification.description', { email: verificationEmail })
                : t('auth.register.description')}
            </p>
          ) : null}
          {notice ? (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          {verificationEmail ? (
            <div className="auth-verification-actions">
              <button
                className="product-primary auth-submit"
                type="button"
                disabled={pending}
                onClick={() =>
                  void (async () => {
                    try {
                      setPending(true);
                      setError('');
                      await api.resendVerification(verificationEmail);
                    } catch (caught) {
                      setError(apiErrorMessage(caught, t, t('auth.failed')));
                    } finally {
                      setPending(false);
                    }
                  })()
                }
              >
                {pending ? t('auth.pending') : t('auth.verification.resend')}
              </button>
              <button className="product-secondary" type="button" onClick={() => void switchMode()}>
                {t('auth.verification.backToSignIn')}
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {isRegister ? (
                <div className="form-field form-field--standard">
                  <div className="field-label-with-help">
                    <label htmlFor="auth-display-name">{t('auth.displayName')}</label>
                    <FieldHelpTooltip
                      label={t('auth.displayName')}
                      help={t('auth.displayNameHelp')}
                    />
                  </div>
                  <input
                    className="form-control form-control--standard"
                    id="auth-display-name"
                    aria-label={t('auth.displayName')}
                    autoComplete="nickname"
                    placeholder={t('auth.displayNamePlaceholder')}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    minLength={2}
                    maxLength={50}
                    required
                  />
                </div>
              ) : null}
              <label className="form-field form-field--standard">
                <span>{t('auth.email')}</span>
                <input
                  className="form-control form-control--standard"
                  autoComplete="email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="form-field form-field--standard">
                <span>{t('auth.password')}</span>
                <span className="form-control-group password-field">
                  <input
                    className="form-control form-control--standard"
                    aria-label={t('auth.password')}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isRegister ? t('auth.newPasswordPlaceholder') : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((current) => !current)}>
                    {t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                  </button>
                </span>
              </label>
              {isRegister ? (
                <div className="form-field form-field--standard">
                  <label htmlFor="auth-confirm-password">{t('auth.confirmPassword')}</label>
                  <input
                    className="form-control form-control--standard"
                    id="auth-confirm-password"
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                  {confirmation && !passwordsMatch ? (
                    <small className="field-error">{t('auth.passwordsDoNotMatch')}</small>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="product-primary auth-submit" type="submit" disabled={!canSubmit}>
                {pending
                  ? t('auth.pending')
                  : t(isRegister ? 'auth.register.submit' : 'auth.login.submit')}
                {!pending ? <span aria-hidden="true">→</span> : null}
              </button>
            </form>
          )}
          {!verificationEmail && !isRegister ? (
            <a className="auth-recovery-link" href="/forgot-password">
              {t('auth.login.forgotPassword')}
            </a>
          ) : null}
          <div className="auth-switch">
            <span>{t(isRegister ? 'auth.register.switchPrompt' : 'auth.login.switchPrompt')}</span>
            <button type="button" onClick={() => void switchMode()}>
              {t(isRegister ? 'auth.register.switchAction' : 'auth.login.switchAction')}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
