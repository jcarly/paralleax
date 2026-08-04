import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Story, StorySummary } from '@paralleax/shared';
import { api } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';

export function StoryList() {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    api
      .listStories()
      .then(setStories)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    try {
      setError('');
      const story = await api.createStory('New story');
      setStories((items) => [...items, summarizeStory(story)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create story');
    }
  }

  async function createDemo() {
    try {
      setError('');
      const story = await api.createDemoStory();
      setStories((items) => [...items, summarizeStory(story)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate demo story');
    }
  }

  async function remove(id: string) {
    try {
      setError('');
      await api.deleteStory(id);
      setStories((items) => items.filter((item) => item.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete story');
    }
  }

  return (
    <main className="page narrow">
      <div className="page-title">
        <div>
          <h1>Stories</h1>
          <p>Create a story, edit its graph, then launch the reader.</p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={createDemo}>
            Generate demo
          </button>
          <button onClick={create}>New story</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="story-grid">
        {stories.map((story) => (
          <article className="story-card" key={story.id}>
            <h2>{story.title}</h2>
            <p>{story.interactionCount} interaction(s)</p>
            <div className="actions">
              <Link
                className="button"
                to={`/stories/${story.id}/edit`}
                onMouseEnter={() => void loadStoryEditor()}
                onFocus={() => void loadStoryEditor()}
              >
                Edit
              </Link>
              <Link
                className="button secondary"
                to={`/stories/${story.id}/play`}
                onMouseEnter={() => void loadStoryPlayer()}
                onFocus={() => void loadStoryPlayer()}
              >
                Read
              </Link>
              <button className="danger ghost" onClick={() => void remove(story.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function summarizeStory(story: Story): StorySummary {
  return {
    id: story.id,
    revision: story.revision,
    title: story.title,
    interactionCount: story.interactions.length,
    startDateTime: story.startDateTime,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
}
