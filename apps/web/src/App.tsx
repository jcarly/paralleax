import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { api, type AuthUser } from './api';
import { AuthPage } from './pages/AuthPage';
import { StoryEditor } from './pages/StoryEditor';
import { StoryList } from './pages/StoryList';
import { StoryPlayer } from './pages/StoryPlayer';
export function App() {
  const [user, setUser] = useState<AuthUser | null>();

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) return <main className="page">Loading...</main>;
  if (user === null) return <AuthPage onAuthenticated={setUser} />;

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
      <Routes>
        <Route path="/" element={<StoryList />} />
        <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
        <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
      </Routes>
    </div>
  );
}
