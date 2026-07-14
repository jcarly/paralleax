import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Story } from '@paralleax/shared';
import { api } from '../api';
export function StoryList() {
  const [stories, setStories] = useState<Story[]>([]); const [error, setError] = useState('');
  const load = () => api.listStories().then(setStories).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  async function create() { const story = await api.createStory(); setStories((items) => [...items, story]); }
  async function remove(id: string) { await api.deleteStory(id); setStories((items) => items.filter((item) => item.id !== id)); }
  return <main className="page narrow"><div className="page-title"><div><h1>Histoires</h1><p>Créez une histoire, éditez son graphe puis lancez le lecteur.</p></div><button onClick={create}>Nouvelle histoire</button></div>{error && <p className="error">{error}</p>}<div className="story-grid">{stories.map((story) => <article className="story-card" key={story.id}><h2>{story.title}</h2><p>{story.interactions.length} interaction(s)</p><div className="actions"><Link className="button" to={`/stories/${story.id}/edit`}>Éditer</Link><Link className="button secondary" to={`/stories/${story.id}/play`}>Lire</Link><button className="danger ghost" onClick={() => void remove(story.id)}>Supprimer</button></div></article>)}</div></main>;
}
