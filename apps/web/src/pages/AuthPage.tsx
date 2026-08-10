import { useState, type FormEvent } from 'react';
import { api, type AuthUser } from '../api';
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
  return (
    <div className="auth-graph" aria-hidden="true">
      <svg viewBox="0 0 560 360" preserveAspectRatio="none">
        <path d="M280 76 V130" />
        <path d="M280 158 V207 H144 V245" />
        <path d="M280 158 V245" />
        <path d="M280 158 V207 H416 V245" />
      </svg>
      <div className="auth-graph-node root">
        <small>START</small>
        <b>A room full of echoes</b>
        <span>The Glasshouse</span>
      </div>
      <span className="auth-graph-trigger" />
      <div className="auth-graph-node left">
        <b>A quiet warning</b>
        <span>Old quarter</span>
      </div>
      <div className="auth-graph-node center">
        <b>The hidden passage</b>
        <span>Lower archive</span>
      </div>
      <div className="auth-graph-node right">
        <b>A voice in the dark</b>
        <span>Lower archive</span>
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
  const [localMode, setLocalMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
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
        ? await api.register(email, password)
        : await api.login(email, password);
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
    } finally {
      setPending(false);
    }
  }

  function switchMode() {
    const nextMode = isRegister ? 'login' : 'register';
    if (!onModeChange) setLocalMode(nextMode);
    setConfirmation('');
    setError('');
    onModeChange?.(nextMode);
  }

  return (
    <main className="product-page auth-layout">
      <section className="auth-showcase">
        <ProductBrand />
        <div className="auth-message">
          <span className="product-eyebrow">Interactive narrative design</span>
          <h1>Every path stays visible.</h1>
          <p>
            Shape branching stories, test their rules, and keep characters, places, items, and time
            in one coherent workspace.
          </p>
        </div>
        <MiniStoryGraph />
        <p className="auth-quote">
          The graph helps you see the story. The model keeps every path reliable.
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <ProductBrand />
          </div>
          <span className="product-eyebrow">{isRegister ? 'Start creating' : 'Welcome back'}</span>
          <h2>{isRegister ? 'Create your account' : 'Sign in to Paralleax'}</h2>
          <p>
            {isRegister
              ? 'Create a private workspace for your interactive stories.'
              : 'Continue working on your stories and simulations.'}
          </p>
          {notice ? (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          <form onSubmit={(event) => void submit(event)}>
            <label className="product-field">
              <span>Email address</span>
              <input
                autoComplete="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="product-field">
              <span>Password</span>
              <span className="password-field">
                <input
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isRegister ? 'At least 8 characters' : 'Enter your password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />
                <button type="button" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            {isRegister ? (
              <label className="product-field">
                <span>Confirm password</span>
                <input
                  autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
                {confirmation && !passwordsMatch ? (
                  <small className="field-error">Passwords do not match.</small>
                ) : null}
              </label>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="product-primary auth-submit" type="submit" disabled={!canSubmit}>
              {pending ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
              {!pending ? <span aria-hidden="true">→</span> : null}
            </button>
          </form>
          <div className="auth-switch">
            <span>{isRegister ? 'Already have an account?' : 'New to Paralleax?'}</span>
            <button type="button" onClick={switchMode}>
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
