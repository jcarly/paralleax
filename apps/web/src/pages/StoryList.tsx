import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { STORY_LIST_PAGE_SIZE, type Story, type StorySummary } from '@paralleax/shared';
import { api, type AuthUser } from '../api';
import { StoryImportDialog } from '../features/story-import/StoryImportDialog';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import './ProductPages.css';

type StoryFilter = 'all' | 'editable' | 'commentable' | 'owned';
type StorySort = 'updated' | 'title';
type StoryView = 'grid' | 'list';

export function StoryList({ user }: { user: AuthUser | null }) {
  const { t } = useTranslation();
  const isAuthenticated = user !== null;
  const isAdministrator = user?.role === 'admin';
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<StoryFilter>('all');
  const [sort, setSort] = useState<StorySort>('updated');
  const [view, setView] = useState<StoryView>('grid');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [pending, setPending] = useState<'story' | 'demo' | ''>('');
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const listRequestVersion = useRef(0);
  const listRequestKey = [
    isAuthenticated ? (user?.id ?? 'authenticated') : 'public',
    debouncedQuery,
    isAuthenticated ? filter : 'all',
    sort,
    refreshVersion,
  ].join(':');
  const loading = loadedRequestKey !== listRequestKey;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let active = true;
    const requestVersion = ++listRequestVersion.current;
    api[isAuthenticated ? 'listStories' : 'listPublicStories']({
      page: 1,
      pageSize: STORY_LIST_PAGE_SIZE,
      query: debouncedQuery,
      filter: isAuthenticated ? filter : 'all',
      sort,
    })
      .then((result) => {
        if (!active || requestVersion !== listRequestVersion.current) return;
        setStories(result.items);
        setPage(result.page);
        setTotalCount(result.totalCount);
        setHasMore(result.hasMore);
        setLoadError('');
      })
      .catch((caught: Error) => {
        if (active && requestVersion === listRequestVersion.current) {
          setLoadError(caught.message);
        }
      })
      .finally(() => {
        if (active && requestVersion === listRequestVersion.current) {
          setLoadedRequestKey(listRequestKey);
        }
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, filter, isAuthenticated, listRequestKey, sort]);

  async function loadMoreStories() {
    if (!hasMore || loadingMore) return;
    const requestVersion = listRequestVersion.current;
    try {
      setError('');
      setLoadingMore(true);
      const result = await api[isAuthenticated ? 'listStories' : 'listPublicStories']({
        page: page + 1,
        pageSize: STORY_LIST_PAGE_SIZE,
        query: debouncedQuery,
        filter: isAuthenticated ? filter : 'all',
        sort,
      });
      if (requestVersion !== listRequestVersion.current) return;
      setStories((current) => [
        ...current,
        ...result.items.filter((item) => !current.some(({ id }) => id === item.id)),
      ]);
      setPage(result.page);
      setTotalCount(result.totalCount);
      setHasMore(result.hasMore);
    } catch (caught) {
      if (requestVersion === listRequestVersion.current) {
        setError(caught instanceof Error ? caught.message : t('library.loadMoreFailed'));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || pending) return;
    try {
      setError('');
      setPending('story');
      const story = await api.createStory(title);
      setStories((items) => [summarizeStory(story, user ?? undefined), ...items]);
      setTotalCount((count) => count + 1);
      setNewTitle('');
      setCreating(false);
      resetLibraryView();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.createFailed'));
    } finally {
      setPending('');
    }
  }

  async function createDemos() {
    if (pending) return;
    try {
      setError('');
      setPending('demo');
      const demos = await api.createDemoStories();
      setStories((items) => [
        ...demos.map((story) => summarizeStory(story, user ?? undefined)),
        ...items,
      ]);
      setTotalCount((count) => count + demos.length);
      resetLibraryView();
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
      setTotalCount((count) => Math.max(0, count - 1));
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.deleteFailed'));
    }
  }

  function resetLibraryView() {
    setQuery('');
    setDebouncedQuery('');
    setFilter('all');
    setSort('updated');
  }

  function retryLoading() {
    setLoadError('');
    setRefreshVersion((version) => version + 1);
  }

  return (
    <main className="product-page library-main">
      <section className="library-heading">
        <div>
          <span className="product-eyebrow">
            {t(isAuthenticated ? 'library.eyebrow' : 'library.anonymous.eyebrow')}
          </span>
          <h1>{t('library.title')}</h1>
          <p>{t(isAuthenticated ? 'library.description' : 'library.anonymous.description')}</p>
        </div>
        {isAuthenticated ? (
          <div className="library-heading-actions">
            {isAdministrator ? (
              <button
                className="product-secondary"
                type="button"
                disabled={Boolean(pending)}
                onClick={() => void createDemos()}
              >
                {t(pending === 'demo' ? 'library.generating' : 'library.generateDemo')}
              </button>
            ) : null}
            <button
              className="product-secondary"
              type="button"
              disabled={Boolean(pending)}
              onClick={() => {
                setError('');
                setImporting(true);
              }}
            >
              <span aria-hidden="true">⇧</span> {t('library.import.action')}
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
        {isAuthenticated ? (
          <div className="library-filters">
            {(
              [
                ['all', 'library.filters.all'],
                ['editable', 'library.filters.editable'],
                ['commentable', 'library.filters.commentable'],
                ['owned', 'library.filters.owned'],
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
        ) : null}
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
      {!loadError ? (
        <div className="library-count" aria-live="polite">
          <b>{totalCount}</b> {t('library.count', { count: totalCount })}
        </div>
      ) : null}

      {loading ? (
        <section className="library-empty" aria-label={t('library.loadingLabel')}>
          <span className="loading-ring" aria-hidden="true" />
          <h2>{t('library.loading')}</h2>
        </section>
      ) : loadError ? (
        <section className="library-empty" role="alert">
          <span aria-hidden="true">!</span>
          <h2>{t('library.loadFailed')}</h2>
          <p>{loadError}</p>
          <button className="product-secondary" type="button" onClick={retryLoading}>
            {t('library.retry')}
          </button>
        </section>
      ) : stories.length ? (
        <>
          <section className={`library-grid ${view === 'list' ? 'list' : ''}`}>
            {stories.map((story, index) => (
              <StoryCard
                key={story.id}
                story={story}
                tone={storyTone(story.id, index)}
                remove={remove}
              />
            ))}
          </section>
          {hasMore ? (
            <div className="library-load-more">
              <button
                className="product-secondary"
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMoreStories()}
              >
                {t(loadingMore ? 'library.loadingMore' : 'library.loadMore')}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <section className="library-empty">
          <span aria-hidden="true">◇</span>
          <h2>{t('library.emptyTitle')}</h2>
          <p>
            {t(
              query || filter !== 'all'
                ? 'library.emptyFiltered'
                : !isAuthenticated
                  ? 'library.anonymous.empty'
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
          ) : isAuthenticated ? (
            <button className="product-secondary" type="button" onClick={() => setCreating(true)}>
              {t('library.createStory')}
            </button>
          ) : null}
        </section>
      )}

      {creating && isAuthenticated ? (
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

      {importing && isAuthenticated ? (
        <StoryImportDialog
          isAdministrator={isAdministrator}
          onClose={() => setImporting(false)}
          onImported={(story) => {
            setStories((items) => [summarizeStory(story, user), ...items]);
            setTotalCount((count) => count + 1);
            resetLibraryView();
          }}
        />
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
          {story.capabilities?.canEdit ? (
            <Link
              className="product-primary compact"
              to={`/stories/${story.id}/edit`}
              onMouseEnter={() => void loadStoryEditor()}
              onFocus={() => void loadStoryEditor()}
            >
              {t('library.card.edit')} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
          {story.capabilities?.canManage ? (
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

function summarizeStory(story: Story, user?: AuthUser): StorySummary {
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
      canComment: true,
    },
    owner: story.owner ?? (user ? { id: user.id, email: user.email } : undefined),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
}
