import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type AuthUser } from './api';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { AuthPage } from './pages/AuthPage';
import { DesignSystemPage } from './pages/DesignSystemPage';
import { StoryList } from './pages/StoryList';
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
  if (user === null)
    return (
      <AuthPage
        initialMode={location.pathname === '/register' ? 'register' : 'login'}
        notice={sessionExpired ? t('shell.sessionExpired') : ''}
        onModeChange={(mode) => navigate(mode === 'register' ? '/register' : '/login')}
        onAuthenticated={(authenticatedUser) => {
          setSessionExpired(false);
          setUser(authenticatedUser);
          navigate('/');
        }}
      />
    );

  return (
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
          <NavLink to="/design-system">{t('shell.designSystem')}</NavLink>
        </nav>
        <span className="product-app-spacer" />
        <LanguageSwitcher className="language-switcher-header" />
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
      </header>
      <Suspense fallback={<main className="page">{t('shell.loadingWorkspace')}</main>}>
        <Routes>
          <Route path="/" element={<StoryList />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="/design-system" element={<DesignSystemPage />} />
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
          <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
        </Routes>
      </Suspense>
    </div>
  );
}
