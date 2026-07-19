import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { api, type AuthUser } from './api';
import { AuthPage } from './pages/AuthPage';
import { StoryList } from './pages/StoryList';
import { loadStoryEditor, loadStoryPlayer } from './pages/storyRouteLoaders';

const StoryEditor = lazy(() =>
  loadStoryEditor().then(({ StoryEditor }) => ({ default: StoryEditor })),
);
const StoryPlayer = lazy(() =>
  loadStoryPlayer().then(({ StoryPlayer }) => ({ default: StoryPlayer })),
);

export function App() {
  const [user, setUser] = useState<AuthUser | null>();
  const [authNotice, setAuthNotice] = useState('');

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const expireSession = () => {
      setAuthNotice('Your session expired. Sign in again to continue.');
      setUser(null);
    };
    window.addEventListener('paralleax:session-expired', expireSession);
    return () => window.removeEventListener('paralleax:session-expired', expireSession);
  }, []);

  if (user === undefined) return <main className="page">Loading...</main>;
  if (user === null)
    return (
      <AuthPage
        notice={authNotice}
        onAuthenticated={(authenticatedUser) => {
          setAuthNotice('');
          setUser(authenticatedUser);
        }}
      />
    );

  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">
          Paralleax
        </Link>
        <span>Interactive story editor</span>
        <span className="header-user">{user.email}</span>
        <button className="ghost" onClick={() => void api.logout().finally(() => setUser(null))}>
          Sign out
        </button>
      </header>
      <Suspense fallback={<main className="page">Loading workspace...</main>}>
        <Routes>
          <Route path="/" element={<StoryList />} />
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
          <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
        </Routes>
      </Suspense>
    </div>
  );
}
