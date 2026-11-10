import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
// Shared tokens and utilities load first; keep feature stylesheet order stable.
import './styles.css';
import './components/formFields.css';
import './features/story-editor/editor.css';
import './components/StoryContextList.css';
import './features/story-editor/inspectors/inspector-layout.css';
import './features/comments/comments.css';
import './features/story-editor/inspectors/inspector-controls.css';
import './components/InteractionEffectCard.css';
import './components/richTextEditor.css';
import './features/story-player/storyPlayer.css';
import './features/story-player/storySimulation.css';
import './responsive.css';
import { i18nReady } from './i18n';
import { App } from './App';
import { startBrowserMonitoring } from './observability/browserMonitoring';
import { RouteErrorPage } from './pages/RouteErrorPage';

const router = createBrowserRouter([
  { path: '*', element: <App />, errorElement: <RouteErrorPage /> },
]);

// Start monitoring on page load, without preventing normal app startup.
void startBrowserMonitoring();

void i18nReady.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
});
