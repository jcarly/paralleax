import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AuthUser } from '../api';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import './ProductPages.css';

export type AuthMode = 'login' | 'register';

function ProductBrand() {
  return (
    <div className="product-brand" aria-label="Paralleax">
      <span aria-hidden="true">P</span>
      <b>Paralleax</b>
    </div>
  );
}

function MiniStoryGraph() {
  const { t } = useTranslation();
  return (
    <div className="auth-graph" aria-hidden="true">
      <svg viewBox="0 0 560 360" preserveAspectRatio="none">
        <path d="M280 76 V130" />
        <path d="M280 158 V207 H144 V245" />
        <path d="M280 158 V245" />
        <path d="M280 158 V207 H416 V245" />
      </svg>
      <div className="auth-graph-node root">
        <small>{t('auth.showcase.graph.start')}</small>
        <b>{t('auth.showcase.graph.root')}</b>
        <span>{t('auth.showcase.graph.glasshouse')}</span>
      </div>
      <span className="auth-graph-trigger" />
      <div className="auth-graph-node left">
        <b>{t('auth.showcase.graph.warning')}</b>
        <span>{t('auth.showcase.graph.oldQuarter')}</span>
      </div>
      <div className="auth-graph-node center">
        <b>{t('auth.showcase.graph.passage')}</b>
        <span>{t('auth.showcase.graph.archive')}</span>
      </div>
      <div className="auth-graph-node right">
        <b>{t('auth.showcase.graph.voice')}</b>
        <span>{t('auth.showcase.graph.archive')}</span>
      </div>
    </div>
  );
}

export function AuthPage({
  onAuthenticated,
  notice = '',
  initialMode = 'login',
  onModeChange,
}: {
  onAuthenticated: (user: AuthUser) => void;
  notice?: string;
  initialMode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
}) {
  const { t } = useTranslation();
  const [localMode, setLocalMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const mode = onModeChange ? initialMode : localMode;
  const isRegister = mode === 'register';
  const passwordsMatch = !isRegister || password === confirmation;
  const canSubmit = email.includes('@') && password.length >= 8 && passwordsMatch && !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      setError('');
      setPending(true);
      const user = isRegister
        ? await api.register(email, password, accessCode || undefined)
        : await api.login(email, password);
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('auth.failed'));
    } finally {
      setPending(false);
    }
  }

  function switchMode() {
    const nextMode = isRegister ? 'login' : 'register';
    if (!onModeChange) setLocalMode(nextMode);
    setConfirmation('');
    setAccessCode('');
    setError('');
    onModeChange?.(nextMode);
  }

  return (
    <main className="product-page auth-layout">
      <section className="auth-showcase">
        <ProductBrand />
        <div className="auth-message">
          <span className="product-eyebrow">{t('auth.showcase.eyebrow')}</span>
          <h1>{t('auth.showcase.title')}</h1>
          <p>{t('auth.showcase.description')}</p>
        </div>
        <MiniStoryGraph />
        <p className="auth-quote">{t('auth.showcase.quote')}</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <LanguageSwitcher className="language-switcher-auth" />
          <div className="auth-mobile-brand">
            <ProductBrand />
          </div>
          <span className="product-eyebrow">
            {t(isRegister ? 'auth.register.eyebrow' : 'auth.login.eyebrow')}
          </span>
          <h2>{t(isRegister ? 'auth.register.title' : 'auth.login.title')}</h2>
          <p>{t(isRegister ? 'auth.register.description' : 'auth.login.description')}</p>
          {notice ? (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          <form onSubmit={(event) => void submit(event)}>
            <label className="product-field">
              <span>{t('auth.email')}</span>
              <input
                autoComplete="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="product-field">
              <span>{t('auth.password')}</span>
              <span className="password-field">
                <input
                  aria-label={t('auth.password')}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t(
                    isRegister ? 'auth.newPasswordPlaceholder' : 'auth.passwordPlaceholder',
                  )}
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
              <>
                <label className="product-field">
                  <span>{t('auth.confirmPassword')}</span>
                  <input
                    autoComplete="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                  {confirmation && !passwordsMatch ? (
                    <small className="field-error">{t('auth.passwordsDoNotMatch')}</small>
                  ) : null}
                </label>
                <label className="product-field">
                  <span>{t('auth.invitationCode')}</span>
                  <input
                    aria-label={t('auth.invitationCode')}
                    autoComplete="off"
                    type="password"
                    placeholder={t('auth.invitationPlaceholder')}
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    maxLength={128}
                  />
                  <small>{t('auth.invitationHelp')}</small>
                </label>
              </>
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
          <div className="auth-switch">
            <span>{t(isRegister ? 'auth.register.switchPrompt' : 'auth.login.switchPrompt')}</span>
            <button type="button" onClick={switchMode}>
              {t(isRegister ? 'auth.register.switchAction' : 'auth.login.switchAction')}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
