import { Link, Route, Routes } from 'react-router-dom';
import { StoryEditor } from './pages/StoryEditor';
import { StoryList } from './pages/StoryList';
import { StoryPlayer } from './pages/StoryPlayer';
export function App() { return <div className="app"><header><Link to="/" className="brand">Paralleax</Link><span>Interactive story editor</span></header><Routes><Route path="/" element={<StoryList/>}/><Route path="/stories/:storyId/edit" element={<StoryEditor/>}/><Route path="/stories/:storyId/play" element={<StoryPlayer/>}/></Routes></div>; }
