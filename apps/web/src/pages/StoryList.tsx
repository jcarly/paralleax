import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Story, StorySummary } from '@paralleax/shared';
import { api } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import './ProductPages.css';

type StoryFilter = 'all' | 'recent' | 'empty';
type StorySort = 'updated' | 'title';
type StoryView = 'grid' | 'list';

const recentThresholdMs = 7 * 24 * 60 * 60 * 1000;

export function StoryList({ mode = 'workspace' }: { mode?: 'public' | 'workspace' }) {
  const { t } = useTranslation();
  const isPublicCatalog = mode === 'public';
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
    api[isPublicCatalog ? 'listPublicStories' : 'listStories']()
      .then(setStories)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [isPublicCatalog]);

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
      setError(caught instanceof Error ? caught.message : t('library.createFailed'));
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
      setError(caught instanceof Error ? caught.message : t('library.demoFailed'));
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
      setError(caught instanceof Error ? caught.message : t('library.deleteFailed'));
    }
  }

  return (
    <main className="product-page library-main">
      <section className="library-heading">
        <div>
          <span className="product-eyebrow">
            {t(isPublicCatalog ? 'library.public.eyebrow' : 'library.eyebrow')}
          </span>
          <h1>{t(isPublicCatalog ? 'library.public.title' : 'library.title')}</h1>
          <p>{t(isPublicCatalog ? 'library.public.description' : 'library.description')}</p>
        </div>
        {!isPublicCatalog ? (
          <div className="library-heading-actions">
            <button
              className="product-secondary"
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void createDemo()}
            >
              {t(pending === 'demo' ? 'library.generating' : 'library.generateDemo')}
            </button>
            <button className="product-primary" type="button" onClick={() => setCreating(true)}>
              <span aria-hidden="true">＋</span> {t('library.newStory')}
            </button>
          </div>
        ) : null}
      </section>

      <section className="library-toolbar" aria-label={t('library.filtersLabel')}>
        <label className="library-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">{t('library.search')}</span>
          <input
            aria-label={t('library.search')}
            type="search"
            placeholder={t('library.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="library-filters">
          {(
            [
              ['all', 'library.filters.all'],
              ['recent', 'library.filters.recent'],
              ['empty', 'library.filters.empty'],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={filter === value ? 'active' : ''}
              key={value}
              type="button"
              onClick={() => setFilter(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <label className="library-sort">
          <span>{t('library.sortBy')}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as StorySort)}>
            <option value="updated">{t('library.lastEdited')}</option>
            <option value="title">{t('library.sortTitle')}</option>
          </select>
        </label>
        <div className="view-toggle" aria-label={t('library.layout')}>
          <button
            aria-label={t('library.gridView')}
            aria-pressed={view === 'grid'}
            className={view === 'grid' ? 'active' : ''}
            type="button"
            onClick={() => setView('grid')}
          >
            ▦
          </button>
          <button
            aria-label={t('library.listView')}
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
        <b>{visibleStories.length}</b> {t('library.count', { count: visibleStories.length })}
      </div>

      {loading ? (
        <section className="library-empty" aria-label={t('library.loadingLabel')}>
          <span className="loading-ring" aria-hidden="true" />
          <h2>{t('library.loading')}</h2>
        </section>
      ) : visibleStories.length ? (
        <section className={`library-grid ${view === 'list' ? 'list' : ''}`}>
          {visibleStories.map((story, index) => (
            <StoryCard
              key={story.id}
              story={story}
              tone={storyTone(story.id, index)}
              remove={remove}
              publicCatalog={isPublicCatalog}
            />
          ))}
        </section>
      ) : (
        <section className="library-empty">
          <span aria-hidden="true">◇</span>
          <h2>{t('library.emptyTitle')}</h2>
          <p>
            {t(
              stories.length
                ? 'library.emptyFiltered'
                : isPublicCatalog
                  ? 'library.public.empty'
                  : 'library.emptyWorkspace',
            )}
          </p>
          {query || filter !== 'all' ? (
            <button
              className="product-secondary"
              type="button"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              {t('library.clearFilters')}
            </button>
          ) : !isPublicCatalog ? (
            <button className="product-secondary" type="button" onClick={() => setCreating(true)}>
              {t('library.createStory')}
            </button>
          ) : null}
        </section>
      )}

      {creating && !isPublicCatalog ? (
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
            <span className="product-eyebrow">{t('library.dialog.eyebrow')}</span>
            <h2 id="new-story-title">{t('library.dialog.title')}</h2>
            <p>{t('library.dialog.description')}</p>
            <form onSubmit={(event) => void create(event)}>
              <label className="product-field">
                <span>{t('library.dialog.storyTitle')}</span>
                <input
                  autoFocus
                  placeholder={t('library.dialog.placeholder')}
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
                  {t('library.dialog.cancel')}
                </button>
                <button
                  className="product-primary"
                  type="submit"
                  disabled={!newTitle.trim() || pending === 'story'}
                >
                  {t(pending === 'story' ? 'library.dialog.creating' : 'library.dialog.submit')}
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
  publicCatalog,
}: {
  story: StorySummary;
  tone: number;
  remove: (id: string) => Promise<void>;
  publicCatalog: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <article className="library-card">
      <div
        className={`story-cover tone-${tone}`}
        role="img"
        aria-label={t('library.card.cover', { title: story.title })}
      >
        <div className="cover-path" />
        <span className="cover-node one" />
        <span className="cover-trigger" />
        <span className="cover-node two" />
        <small>{String(tone + 1).padStart(2, '0')}</small>
      </div>
      <div className="library-card-body">
        <span className="product-badge neutral">
          {t(`library.card.visibility.${story.access?.visibility ?? 'private'}`)}
        </span>
        <h2>{story.title}</h2>
        <p>
          {t(
            story.interactionCount
              ? 'library.card.continueDescription'
              : 'library.card.emptyDescription',
          )}
        </p>
        <dl>
          <div>
            <dt>{t('library.card.interactions')}</dt>
            <dd>{story.interactionCount}</dd>
          </div>
          <div>
            <dt>{t('library.card.created')}</dt>
            <dd>{formatDate(story.createdAt, locale, t('library.card.unknownDate'))}</dd>
          </div>
        </dl>
      </div>
      <footer>
        <span>
          {t('library.card.edited', {
            date: formatDate(story.updatedAt, locale, t('library.card.unknownDate')),
          })}
        </span>
        <div>
          <Link
            className="product-secondary compact"
            to={`/stories/${story.id}/play`}
            onMouseEnter={() => void loadStoryPlayer()}
            onFocus={() => void loadStoryPlayer()}
          >
            {t('library.card.read')}
          </Link>
          {!publicCatalog && story.capabilities?.canEdit !== false ? (
            <Link
              className="product-primary compact"
              to={`/stories/${story.id}/edit`}
              onMouseEnter={() => void loadStoryEditor()}
              onFocus={() => void loadStoryEditor()}
            >
              {t('library.card.edit')} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
          {!publicCatalog && story.capabilities?.canManage !== false ? (
            <>
              <Link className="product-ghost compact" to={`/stories/${story.id}/access`}>
                {t('library.card.access')}
              </Link>
              <button
                className="product-ghost danger-text compact"
                type="button"
                onClick={() => void remove(story.id)}
              >
                {t('library.card.delete')}
              </button>
            </>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function storyTone(id: string, index: number) {
  return [...id].reduce((total, character) => total + character.charCodeAt(0), index) % 4;
}

function formatDate(value: string, locale: string, unknownDate: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unknownDate;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function summarizeStory(story: Story): StorySummary {
  return {
    id: story.id,
    revision: story.revision,
    title: story.title,
    interactionCount: story.interactions.length,
    startDateTime: story.startDateTime,
    access: story.access,
    capabilities: story.capabilities ?? {
      canRead: true,
      canEdit: true,
      canManage: true,
      canComment: false,
    },
    owner: story.owner,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
}
