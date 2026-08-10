import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type AuthUser } from './api';
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
  const location = useLocation();
  const navigate = useNavigate();
  const isPrototype =
    location.pathname === '/prototype/paralleax' ||
    location.pathname.startsWith('/prototype/paralleax/');
  const [user, setUser] = useState<AuthUser | null>();
  const [authNotice, setAuthNotice] = useState('');

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
      setAuthNotice('Your session expired. Sign in again to continue.');
      setUser(null);
    };
    window.addEventListener('paralleax:session-expired', expireSession);
    return () => window.removeEventListener('paralleax:session-expired', expireSession);
  }, [isPrototype]);

  if (isPrototype) return <ParalleaxPrototype />;
  if (user === undefined) return <main className="page">Loading...</main>;
  if (user === null)
    return (
      <AuthPage
        initialMode={location.pathname === '/register' ? 'register' : 'login'}
        notice={authNotice}
        onModeChange={(mode) => navigate(mode === 'register' ? '/register' : '/login')}
        onAuthenticated={(authenticatedUser) => {
          setAuthNotice('');
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
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Stories
          </NavLink>
          <NavLink to="/design-system">Design system</NavLink>
        </nav>
        <span className="product-app-spacer" />
        <span className="product-user">
          <span aria-hidden="true">{user.email.slice(0, 2).toUpperCase()}</span>
          <span>{user.email}</span>
        </span>
        <button
          className="product-signout"
          onClick={() => void api.logout().finally(() => setUser(null))}
        >
          Sign out
        </button>
      </header>
      <Suspense fallback={<main className="page">Loading workspace...</main>}>
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
