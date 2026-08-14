import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type AuthUser } from './api';
import { authenticationPath, safeReturnTo } from './authNavigation';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { AuthPage } from './pages/AuthPage';
import { StoryList } from './pages/StoryList';
import { StoryAccessPage } from './pages/StoryAccessPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { ParalleaxPrototype } from './pages/ParalleaxPrototype';
import { loadStoryEditor, loadStoryPlayer } from './pages/storyRouteLoaders';

const StoryEditor = lazy(() =>
  loadStoryEditor().then(({ StoryEditor }) => ({ default: StoryEditor })),
);
const StoryPlayer = lazy(() =>
  loadStoryPlayer().then(({ StoryPlayer }) => ({ default: StoryPlayer })),
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

  if (isPrototype) return <ParalleaxPrototype />;
  if (user === undefined) return <main className="page">{t('shell.loading')}</main>;
  const currentDestination = `${location.pathname}${location.search}${location.hash}`;
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const isAuthenticationRoute = location.pathname === '/login' || location.pathname === '/register';

  if (user === null && isAuthenticationRoute)
    return (
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
    );

  const signInPath = authenticationPath('login', currentDestination);
  const registerPath = authenticationPath('register', currentDestination);

  return (
    <div className="app">
      <header className="product-app-header">
        <Link to="/" className="product-app-brand">
          <span aria-hidden="true">P</span>
          <b>Paralleax</b>
        </Link>
        <nav aria-label={t('shell.mainNavigation')}>
          <NavLink to="/" end>
            {t('shell.publicStories')}
          </NavLink>
          {user ? <NavLink to="/stories">{t('shell.myStories')}</NavLink> : null}
          {user?.role === 'admin' ? (
            <NavLink to="/admin/users">{t('shell.administration')}</NavLink>
          ) : null}
        </nav>
        <span className="product-app-spacer" />
        <LanguageSwitcher className="language-switcher-header" />
        {user ? (
          <>
            <span className="product-user">
              <span aria-hidden="true">{user.email.slice(0, 2).toUpperCase()}</span>
              <span>{user.email}</span>
            </span>
            <button
              className="product-signout"
              onClick={() => void api.logout().finally(() => setUser(null))}
            >
              {t('shell.signOut')}
            </button>
          </>
        ) : (
          <>
            <Link className="product-secondary compact" to={signInPath}>
              {t('shell.signIn')}
            </Link>
            <Link className="product-primary compact" to={registerPath}>
              {t('shell.register')}
            </Link>
          </>
        )}
      </header>
      <Suspense fallback={<main className="page">{t('shell.loadingWorkspace')}</main>}>
        <Routes>
          <Route path="/" element={<StoryList mode="public" />} />
          <Route path="/login" element={<Navigate to={returnTo} replace />} />
          <Route path="/register" element={<Navigate to={returnTo} replace />} />
          <Route
            path="/stories"
            element={user ? <StoryList /> : <Navigate to={signInPath} replace />}
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
            element={<StoryPlayer authenticated={Boolean(user)} />}
          />
          {user?.role === 'admin' ? (
            <Route path="/admin/users" element={<AdminUsersPage currentUserId={user.id} />} />
          ) : (
            <Route
              path="/admin/users"
              element={<Navigate to={user ? '/' : signInPath} replace />}
            />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
