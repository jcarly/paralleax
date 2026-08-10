import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Story, StorySummary } from '@paralleax/shared';
import { api } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import './ProductPages.css';

type StoryFilter = 'all' | 'recent' | 'empty';
type StorySort = 'updated' | 'title';
type StoryView = 'grid' | 'list';

const recentThresholdMs = 7 * 24 * 60 * 60 * 1000;

export function StoryList() {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StoryFilter>('all');
  const [sort, setSort] = useState<StorySort>('updated');
  const [view, setView] = useState<StoryView>('grid');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [pending, setPending] = useState<'story' | 'demo' | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listStories()
      .then(setStories)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  const visibleStories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const newestUpdate = stories.reduce(
      (latest, story) => Math.max(latest, Date.parse(story.updatedAt)),
      0,
    );
    return stories
      .filter((story) => {
        if (filter === 'recent' && newestUpdate - Date.parse(story.updatedAt) > recentThresholdMs) {
          return false;
        }
        if (filter === 'empty' && story.interactionCount !== 0) return false;
        return story.title.toLocaleLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) =>
        sort === 'title'
          ? left.title.localeCompare(right.title)
          : Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );
  }, [filter, query, sort, stories]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || pending) return;
    try {
      setError('');
      setPending('story');
      const story = await api.createStory(title);
      setStories((items) => [summarizeStory(story), ...items]);
      setNewTitle('');
      setCreating(false);
      setFilter('all');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create story');
    } finally {
      setPending('');
    }
  }

  async function createDemo() {
    if (pending) return;
    try {
      setError('');
      setPending('demo');
      const story = await api.createDemoStory();
      setStories((items) => [summarizeStory(story), ...items]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate demo story');
    } finally {
      setPending('');
    }
  }

  async function remove(id: string) {
    try {
      setError('');
      await api.deleteStory(id);
      setStories((items) => items.filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete story');
    }
  }

  return (
    <main className="product-page library-main">
      <section className="library-heading">
        <div>
          <span className="product-eyebrow">Your workspace</span>
          <h1>Stories</h1>
          <p>Create, organize, and return to every interactive narrative.</p>
        </div>
        <div className="library-heading-actions">
          <button
            className="product-secondary"
            type="button"
            disabled={Boolean(pending)}
            onClick={() => void createDemo()}
          >
            {pending === 'demo' ? 'Generating…' : 'Generate demo'}
          </button>
          <button className="product-primary" type="button" onClick={() => setCreating(true)}>
            <span aria-hidden="true">＋</span> New story
          </button>
        </div>
      </section>

      <section className="library-toolbar" aria-label="Story filters">
        <label className="library-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search stories</span>
          <input
            aria-label="Search stories"
            type="search"
            placeholder="Search stories…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="library-filters">
          {(
            [
              ['all', 'All stories'],
              ['recent', 'Recently edited'],
              ['empty', 'Empty'],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? 'active' : ''}
              key={value}
              type="button"
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="library-sort">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as StorySort)}>
            <option value="updated">Last edited</option>
            <option value="title">Title</option>
          </select>
        </label>
        <div className="view-toggle" aria-label="Story layout">
          <button
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            className={view === 'grid' ? 'active' : ''}
            type="button"
            onClick={() => setView('grid')}
          >
            ▦
          </button>
          <button
            aria-label="List view"
            aria-pressed={view === 'list'}
            className={view === 'list' ? 'active' : ''}
            type="button"
            onClick={() => setView('list')}
          >
            ☷
          </button>
        </div>
      </section>

      {error ? (
        <p className="library-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="library-count" aria-live="polite">
        <b>{visibleStories.length}</b> {visibleStories.length === 1 ? 'story' : 'stories'}
      </div>

      {loading ? (
        <section className="library-empty" aria-label="Loading stories">
          <span className="loading-ring" aria-hidden="true" />
          <h2>Loading stories</h2>
        </section>
      ) : visibleStories.length ? (
        <section className={`library-grid ${view === 'list' ? 'list' : ''}`}>
          {visibleStories.map((story, index) => (
            <StoryCard
              key={story.id}
              story={story}
              tone={storyTone(story.id, index)}
              remove={remove}
            />
          ))}
        </section>
      ) : (
        <section className="library-empty">
          <span aria-hidden="true">◇</span>
          <h2>No stories found</h2>
          <p>{stories.length ? 'Try another search or filter.' : 'Create your first story.'}</p>
          {query || filter !== 'all' ? (
            <button
              className="product-secondary"
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Clear filters
            </button>
          ) : (
            <button className="product-secondary" type="button" onClick={() => setCreating(true)}>
              Create a story
            </button>
          )}
        </section>
      )}

      {creating ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="new-story-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-story-title"
          >
            <div className="dialog-icon" aria-hidden="true">
              ◇
            </div>
            <span className="product-eyebrow">New narrative</span>
            <h2 id="new-story-title">Create a story</h2>
            <p>Start with a private, empty story. Add its first interaction in the editor.</p>
            <form onSubmit={(event) => void create(event)}>
              <label className="product-field">
                <span>Story title</span>
                <input
                  autoFocus
                  placeholder="Untitled story"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                />
              </label>
              <div className="dialog-actions">
                <button
                  className="product-secondary"
                  type="button"
                  disabled={pending === 'story'}
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button
                  className="product-primary"
                  type="submit"
                  disabled={!newTitle.trim() || pending === 'story'}
                >
                  {pending === 'story' ? 'Creating…' : 'Create story'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function StoryCard({
  story,
  tone,
  remove,
}: {
  story: StorySummary;
  tone: number;
  remove: (id: string) => Promise<void>;
}) {
  return (
    <article className="library-card">
      <div
        className={`story-cover tone-${tone}`}
        role="img"
        aria-label={`Abstract cover for ${story.title}`}
      >
        <div className="cover-path" />
        <span className="cover-node one" />
        <span className="cover-trigger" />
        <span className="cover-node two" />
        <small>{String(tone + 1).padStart(2, '0')}</small>
      </div>
      <div className="library-card-body">
        <span className="product-badge neutral">Private</span>
        <h2>{story.title}</h2>
        <p>
          {story.interactionCount
            ? 'Continue shaping this interactive narrative.'
            : 'A new story waiting for its first interaction.'}
        </p>
        <dl>
          <div>
            <dt>Interactions</dt>
            <dd>{story.interactionCount}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDate(story.createdAt)}</dd>
          </div>
        </dl>
      </div>
      <footer>
        <span>Edited {formatDate(story.updatedAt)}</span>
        <div>
          <Link
            className="product-secondary compact"
            to={`/stories/${story.id}/play`}
            onMouseEnter={() => void loadStoryPlayer()}
            onFocus={() => void loadStoryPlayer()}
          >
            Read
          </Link>
          <Link
            className="product-primary compact"
            to={`/stories/${story.id}/edit`}
            onMouseEnter={() => void loadStoryEditor()}
            onFocus={() => void loadStoryEditor()}
          >
            Edit <span aria-hidden="true">→</span>
          </Link>
          <button
            className="product-ghost danger-text compact"
            type="button"
            onClick={() => void remove(story.id)}
          >
            Delete
          </button>
        </div>
      </footer>
    </article>
  );
}

function storyTone(id: string, index: number) {
  return [...id].reduce((total, character) => total + character.charCodeAt(0), index) % 4;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    date,
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
