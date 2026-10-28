import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type AuthUser } from './api';
import { authenticationPath, safeReturnTo } from './authNavigation';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { OnboardingHelpButton } from './features/onboarding/OnboardingHelpButton';
import { OnboardingProvider } from './features/onboarding/OnboardingProvider';
import { useOnboarding } from './features/onboarding/onboardingContext';
import type { AccountAction } from './pages/AccountActionPage';
import { StoryList } from './pages/StoryList';
import {
  loadParalleaxPrototype,
  loadStoryEditor,
  loadStoryPlayer,
} from './pages/storyRouteLoaders';

const ParalleaxPrototype = lazy(() =>
  loadParalleaxPrototype().then(({ ParalleaxPrototype: component }) => ({ default: component })),
);

const StoryEditor = lazy(() =>
  loadStoryEditor().then(({ StoryEditor: component }) => ({ default: component })),
);
const StoryPlayer = lazy(() =>
  loadStoryPlayer().then(({ StoryPlayer: component }) => ({ default: component })),
);
const FeedbackButton = lazy(() =>
  import('./features/feedback/FeedbackButton').then(({ FeedbackButton: component }) => ({
    default: component,
  })),
);
const OnboardingGuide = lazy(() => import('./features/onboarding/OnboardingGuide'));
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then(({ AuthPage: component }) => ({ default: component })),
);
const AccountDialog = lazy(() =>
  import('./components/AccountDialog').then(({ AccountDialog: component }) => ({ default: component })),
);
const AccountActionPage = lazy(() =>
  import('./pages/AccountActionPage').then(({ AccountActionPage: component }) => ({
    default: component,
  })),
);
const StoryAccessPage = lazy(() =>
  import('./pages/StoryAccessPage').then(({ StoryAccessPage: component }) => ({ default: component })),
);
const AdminUsersPage = lazy(() =>
  import('./pages/AdminUsersPage').then(({ AdminUsersPage: component }) => ({ default: component })),
);
const DesignSystemPage = lazy(() =>
  import('./pages/DesignSystemPage').then(({ DesignSystemPage: component }) => ({
    default: component,
  })),
);

export function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isPrototype =
    location.pathname === '/prototype/paralleax' ||
    location.pathname.startsWith('/prototype/paralleax/');
  const [user, setUser] = useState<AuthUser | null>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (isPrototype) return;
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, [isPrototype]);

  useEffect(() => {
    if (isPrototype) return;
    const expireSession = () => {
      setSessionExpired(true);
      setUser(null);
    };
    window.addEventListener('paralleax:session-expired', expireSession);
    return () => window.removeEventListener('paralleax:session-expired', expireSession);
  }, [isPrototype]);

  if (isPrototype)
    return (
      <Suspense fallback={<main className="page">{t('shell.loadingWorkspace')}</main>}>
        <ParalleaxPrototype />
      </Suspense>
    );
  if (user === undefined) return <main className="page">{t('shell.loading')}</main>;
  const currentDestination = `${location.pathname}${location.search}${location.hash}`;
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const isAuthenticationRoute = location.pathname === '/login' || location.pathname === '/register';
  const accountAction = accountActionForPath(location.pathname);

  if (accountAction)
    return (
      <Suspense fallback={<main className="page">{t('shell.loadingWorkspace')}</main>}>
        <AccountActionPage
          action={accountAction}
          onBackToSignIn={() => navigate('/login', { replace: true })}
          onAuthenticated={(authenticatedUser) => {
            setSessionExpired(false);
            setUser(authenticatedUser);
            navigate('/', { replace: true });
          }}
        />
      </Suspense>
    );

  if (user === null && isAuthenticationRoute)
    return (
      <Suspense fallback={<main className="page">{t('shell.loadingWorkspace')}</main>}>
        <AuthPage
          initialMode={location.pathname === '/register' ? 'register' : 'login'}
          notice={sessionExpired ? t('shell.sessionExpired') : ''}
          onModeChange={(mode) => navigate(authenticationPath(mode, returnTo), { replace: true })}
          onAuthenticated={(authenticatedUser) => {
            setSessionExpired(false);
            setUser(authenticatedUser);
            navigate(returnTo, { replace: true });
          }}
        />
      </Suspense>
    );

  const signInPath = authenticationPath('login', currentDestination);
  const registerPath = authenticationPath('register', currentDestination);
  const currentStoryId = location.pathname.match(/^\/stories\/([^/]+)\/(edit|play)\/?$/)?.[1];

  return (
    <OnboardingProvider key={user?.id ?? 'anonymous'} userId={user?.id ?? null}>
      <div className="app">
      <header className="product-app-header">
        <Link to="/" className="product-app-brand">
          <span aria-hidden="true">P</span>
          <b>Paralleax</b>
        </Link>
        <nav aria-label={t('shell.mainNavigation')}>
          <NavLink to="/" end>
            {t('shell.stories')}
          </NavLink>
          {user?.role === 'admin' ? (
            <NavLink to="/admin/users">{t('shell.administration')}</NavLink>
          ) : null}
        </nav>
        <span className="product-app-spacer" />
        <Suspense fallback={null}>
          <FeedbackButton />
        </Suspense>
        {user ? <OnboardingHelpButton storyId={currentStoryId} /> : null}
        <LanguageSwitcher className="language-switcher-header" />
        {user ? (
          <>
            <button
              className="product-user"
              type="button"
              aria-label={`${user.displayName.slice(0, 2).toUpperCase()} ${user.displayName}: ${t('shell.account')}`}
              onClick={() => setAccountOpen(true)}
            >
              <span aria-hidden="true">{user.displayName.slice(0, 2).toUpperCase()}</span>{' '}
              <span>{user.displayName}</span>
            </button>
            <button
              className="product-signout"
              onClick={() => void api.logout().finally(() => setUser(null))}
            >
              {t('shell.signOut')}
            </button>
          </>
        ) : (
          <div className="product-auth-actions" role="group" aria-label={t('shell.accountAccess')}>
            <Link className="product-secondary compact product-auth-signin" to={signInPath}>
              {t('shell.signIn')}
            </Link>
            <Link className="product-primary product-account-create" to={registerPath}>
              {t('shell.register')}
            </Link>
          </div>
        )}
      </header>
      <Suspense fallback={null}>{user ? <OnboardingGuide /> : null}</Suspense>
      <Suspense fallback={<main className="page">{t('shell.loadingWorkspace')}</main>}>
        <Routes>
          <Route
            path="/"
            element={
              <OnboardingStoryList
                key={user ? `${user.id}:${user.displayName}` : 'anonymous'}
                user={user}
              />
            }
          />
          <Route path="/login" element={<Navigate to={returnTo} replace />} />
          <Route path="/register" element={<Navigate to={returnTo} replace />} />
          <Route
            path="/stories"
            element={user ? <Navigate to="/" replace /> : <Navigate to={signInPath} replace />}
          />
          <Route
            path="/stories/:storyId/edit"
            element={
              user ? <StoryEditor currentUserId={user.id} /> : <Navigate to={signInPath} replace />
            }
          />
          <Route
            path="/stories/:storyId/access"
            element={user ? <StoryAccessPage /> : <Navigate to={signInPath} replace />}
          />
          <Route
            path="/stories/:storyId/play"
            element={<StoryPlayer authenticated={Boolean(user)} currentUserId={user?.id} />}
          />
          {user?.role === 'admin' ? (
            <Route path="/admin/users" element={<AdminUsersPage currentUserId={user.id} />} />
          ) : (
            <Route
              path="/admin/users"
              element={<Navigate to={user ? '/' : signInPath} replace />}
            />
          )}
          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {user && accountOpen ? (
        <Suspense fallback={null}>
          <AccountDialog user={user} onClose={() => setAccountOpen(false)} onUpdated={setUser} />
        </Suspense>
      ) : null}
      </div>
    </OnboardingProvider>
  );
}

function OnboardingStoryList({ user }: { user: AuthUser | null }) {
  const onboarding = useOnboarding();
  return (
    <StoryList
      user={user}
      onStoryCreated={onboarding.beginForStory}
      onStoryDeleted={onboarding.reportStoryDeleted}
    />
  );
}

function accountActionForPath(pathname: string): AccountAction | undefined {
  if (pathname === '/verify-email') return 'verify-email';
  if (pathname === '/reset-password') return 'reset-password';
  if (pathname === '/forgot-password') return 'request-password-reset';
  return undefined;
}
