import { useTranslation } from 'react-i18next';
import type { StorySummary } from '@paralleax/shared';
import { StoryCard } from './StoryCard';
import type { StoryFilter, StorySort, StoryView } from './storyListTypes';

export function StoryListHeading({
  isAuthenticated,
  isAdministrator,
  pending,
  createDemos,
  openImportDialog,
  openCreationDialog,
}: {
  isAuthenticated: boolean;
  isAdministrator: boolean;
  pending: 'story' | 'demo' | '';
  createDemos: () => void;
  openImportDialog: (trigger: HTMLElement) => void;
  openCreationDialog: (trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="library-heading">
      <div>
        <h1>{t('library.title')}</h1>
        <p>{t(isAuthenticated ? 'library.description' : 'library.anonymous.description')}</p>
      </div>
      {isAuthenticated ? (
        <div className="library-heading-actions">
          {isAdministrator ? <DemoStoriesButton pending={pending} onClick={createDemos} /> : null}
          <button
            className="product-secondary"
            type="button"
            disabled={pending !== ''}
            onClick={(event) => {
              openImportDialog(event.currentTarget);
            }}
          >
            <span aria-hidden="true">⇧</span> {t('library.import.action')}
          </button>
          <button
            className="product-primary"
            data-onboarding-target="story-create"
            type="button"
            onClick={(event) => {
              openCreationDialog(event.currentTarget);
            }}
          >
            <span aria-hidden="true">＋</span> {t('library.newStory')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DemoStoriesButton({
  pending,
  onClick,
}: {
  pending: 'story' | 'demo' | '';
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button className="product-secondary" type="button" disabled={pending !== ''} onClick={onClick}>
      {t(pending === 'demo' ? 'library.generating' : 'library.generateDemo')}
    </button>
  );
}

export function StoryListToolbar({
  isAuthenticated,
  query,
  setQuery,
  filter,
  setFilter,
  sort,
  setSort,
  view,
  setView,
}: {
  isAuthenticated: boolean;
  query: string;
  setQuery: (query: string) => void;
  filter: StoryFilter;
  setFilter: (filter: StoryFilter) => void;
  sort: StorySort;
  setSort: (sort: StorySort) => void;
  view: StoryView;
  setView: (view: StoryView) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="library-toolbar" aria-label={t('library.filtersLabel')}>
      <label className="library-search">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">{t('library.search')}</span>
        <input
          aria-label={t('library.search')}
          type="search"
          placeholder={t('library.searchPlaceholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>
      {isAuthenticated ? <StoryFilterButtons filter={filter} setFilter={setFilter} /> : null}
      <StorySortSelector sort={sort} setSort={setSort} />
      <StoryViewButtons view={view} setView={setView} />
    </section>
  );
}

function StoryFilterButtons({
  filter,
  setFilter,
}: {
  filter: StoryFilter;
  setFilter: (filter: StoryFilter) => void;
}) {
  const { t } = useTranslation();
  const filters = [
    ['all', 'library.filters.all'],
    ['editable', 'library.filters.editable'],
    ['commentable', 'library.filters.commentable'],
    ['owned', 'library.filters.owned'],
  ] as const;
  return (
    <div className="library-filters">
      {filters.map(([value, label]) => (
        <button
          aria-pressed={filter === value}
          className={filter === value ? 'active' : ''}
          key={value}
          type="button"
          onClick={() => {
            setFilter(value);
          }}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

function StorySortSelector({
  sort,
  setSort,
}: {
  sort: StorySort;
  setSort: (sort: StorySort) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="library-sort">
      <span>{t('library.sortBy')}</span>
      {/* eslint-disable-next-line design-system/require-shared-form-control -- sorting is a compact toolbar control, not a property field */}
      <select
        value={sort}
        onChange={(event) => {
          updateStorySort(event.target.value, setSort);
        }}
      >
        <option value="updated">{t('library.lastEdited')}</option>
        <option value="title">{t('library.sortTitle')}</option>
      </select>
    </label>
  );
}

function updateStorySort(value: string, setSort: (sort: StorySort) => void) {
  if (value === 'title' || value === 'updated') {
    setSort(value);
  }
}

function StoryViewButtons({
  view,
  setView,
}: {
  view: StoryView;
  setView: (view: StoryView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="view-toggle" aria-label={t('library.layout')}>
      <button
        aria-label={t('library.gridView')}
        aria-pressed={view === 'grid'}
        className={view === 'grid' ? 'active' : ''}
        type="button"
        onClick={() => {
          setView('grid');
        }}
      >
        ▦
      </button>
      <button
        aria-label={t('library.listView')}
        aria-pressed={view === 'list'}
        className={view === 'list' ? 'active' : ''}
        type="button"
        onClick={() => {
          setView('list');
        }}
      >
        ☷
      </button>
    </div>
  );
}

export type StoryListResultsProps = {
  loading: boolean;
  loadError: string;
  stories: StorySummary[];
  totalCount: number;
  view: StoryView;
  hasMore: boolean;
  loadingMore: boolean;
  deletingStoryId: string;
  error: string;
  query: string;
  filter: StoryFilter;
  isAuthenticated: boolean;
  retryLoading: () => void;
  loadMoreStories: () => void;
  removeStory: (id: string) => Promise<string | null>;
  clearFilters: () => void;
  openCreationDialog: (trigger: HTMLElement) => void;
};

export function StoryListResults(props: StoryListResultsProps) {
  return (
    <>
      <StoryListStatus
        error={props.error}
        loadError={props.loadError}
        totalCount={props.totalCount}
      />
      <StoryResultsState {...props} />
    </>
  );
}

function StoryListStatus({
  error,
  loadError,
  totalCount,
}: Pick<StoryListResultsProps, 'error' | 'loadError' | 'totalCount'>) {
  const { t } = useTranslation();
  return (
    <>
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
    </>
  );
}

function StoryResultsState(props: Omit<StoryListResultsProps, 'error' | 'totalCount'>) {
  if (props.loading) {
    return <StoryLoading />;
  }
  if (props.loadError) {
    return <StoryLoadError message={props.loadError} retryLoading={props.retryLoading} />;
  }
  if (props.stories.length > 0) {
    return <StoryGrid {...props} />;
  }
  return <StoryEmptyState {...props} />;
}

function StoryLoading() {
  const { t } = useTranslation();
  return (
    <section className="library-empty" aria-label={t('library.loadingLabel')}>
      <span className="loading-ring" aria-hidden="true" />
      <h2>{t('library.loading')}</h2>
    </section>
  );
}

function StoryLoadError({ message, retryLoading }: { message: string; retryLoading: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="library-empty" role="alert">
      <span aria-hidden="true">!</span>
      <h2>{t('library.loadFailed')}</h2>
      <p>{message}</p>
      <button className="product-secondary" type="button" onClick={retryLoading}>
        {t('library.retry')}
      </button>
    </section>
  );
}

function StoryGrid({
  stories,
  view,
  hasMore,
  loadingMore,
  deletingStoryId,
  loadMoreStories,
  removeStory,
}: Omit<
  Parameters<typeof StoryListResults>[0],
  | 'loading'
  | 'loadError'
  | 'totalCount'
  | 'error'
  | 'query'
  | 'filter'
  | 'isAuthenticated'
  | 'retryLoading'
  | 'clearFilters'
  | 'openCreationDialog'
>) {
  const { t } = useTranslation();
  return (
    <>
      <section className={`library-grid ${view === 'list' ? 'list' : ''}`}>
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            remove={removeStory}
            deleting={deletingStoryId === story.id}
            deleteDisabled={deletingStoryId !== ''}
          />
        ))}
      </section>
      {hasMore ? (
        <div className="library-load-more">
          <button
            className="product-secondary"
            type="button"
            disabled={loadingMore}
            onClick={loadMoreStories}
          >
            {t(loadingMore ? 'library.loadingMore' : 'library.loadMore')}
          </button>
        </div>
      ) : null}
    </>
  );
}

function StoryEmptyState({
  query,
  filter,
  isAuthenticated,
  clearFilters,
  openCreationDialog,
}: Pick<
  Parameters<typeof StoryListResults>[0],
  'query' | 'filter' | 'isAuthenticated' | 'clearFilters' | 'openCreationDialog'
>) {
  const { t } = useTranslation();
  const hasFilters = query !== '' || filter !== 'all';
  const description = hasFilters
    ? 'library.emptyFiltered'
    : isAuthenticated
      ? 'library.emptyWorkspace'
      : 'library.anonymous.empty';
  return (
    <section className="library-empty">
      <span aria-hidden="true">◇</span>
      <h2>{t('library.emptyTitle')}</h2>
      <p>{t(description)}</p>
      {hasFilters ? (
        <button className="product-secondary" type="button" onClick={clearFilters}>
          {t('library.clearFilters')}
        </button>
      ) : null}
      {!hasFilters && isAuthenticated ? (
        <CreateStoryButton
          openCreationDialog={openCreationDialog}
          label={t('library.createStory')}
        />
      ) : null}
    </section>
  );
}

function CreateStoryButton({
  openCreationDialog,
  label,
}: {
  openCreationDialog: (trigger: HTMLElement) => void;
  label: string;
}) {
  return (
    <button
      className="product-secondary"
      type="button"
      onClick={(event) => {
        openCreationDialog(event.currentTarget);
      }}
    >
      {label}
    </button>
  );
}
