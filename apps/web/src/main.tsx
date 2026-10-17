import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './styles.css';
import './features/story-editor/editor.css';
import './features/story-editor/inspectors/inspector-layout.css';
import './features/comments/comments.css';
import './features/story-editor/inspectors/inspector-controls.css';
import './features/story-player/storyPlayer.css';
import './features/story-player/storySimulation.css';
import './responsive.css';
import './i18n';
import { App } from './App';

const router = createBrowserRouter([{ path: '*', element: <App /> }]);

if (import.meta.env.VITE_SENTRY_DSN?.trim()) {
  void import('./observability/sentry')
    .then(({ initializeSentry }) => initializeSentry())
    .catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
