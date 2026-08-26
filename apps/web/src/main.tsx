import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './features/story-editor/editor.css';
import './features/story-editor/inspectors/inspector-layout.css';
import './features/comments/comments.css';
import './features/story-editor/inspectors/inspector-controls.css';
import './features/story-editor/graph/storyGraph.css';
import './features/story-player/storyPlayer.css';
import './features/story-player/storySimulation.css';
import './responsive.css';
import './i18n';
import { App } from './App';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
