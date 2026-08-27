import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ChoiceScriptImportReport, Story, StorySummary } from '@paralleax/shared';
import { api, type AuthUser } from '../api';
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
  const [filter, setFilter] = useState<StoryFilter>('all');
  const [sort, setSort] = useState<StorySort>('updated');
  const [view, setView] = useState<StoryView>('grid');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importRequestError, setImportRequestError] = useState('');
  const [importOutcome, setImportOutcome] = useState<{
    story: Story;
    report: ChoiceScriptImportReport;
  }>();
  const [newTitle, setNewTitle] = useState('');
  const [pending, setPending] = useState<'story' | 'demo' | 'import' | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const importSourceSize = importFiles.reduce((total, file) => total + file.size, 0);
  const importSelectionError =
    importFiles.length > 50
      ? t('library.import.tooManyFiles')
      : importFiles.some(({ size }) => size > 65_536)
        ? t('library.import.fileTooLarge')
        : importSourceSize > 96 * 1024
          ? t('library.import.tooLarge')
          : '';

  useEffect(() => {
    let active = true;
    api[isAuthenticated ? 'listStories' : 'listPublicStories']()
      .then((items) => {
        if (active) setStories(items);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.id]);

  const visibleStories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return stories
      .filter((story) => {
        if (filter === 'editable' && !story.capabilities?.canEdit) return false;
        if (filter === 'commentable' && !story.capabilities?.canComment) return false;
        if (filter === 'owned' && story.owner?.id !== user?.id) return false;
        return story.title.toLocaleLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) =>
        sort === 'title'
          ? left.title.localeCompare(right.title)
          : Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      );
  }, [filter, query, sort, stories, user?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || pending) return;
    try {
      setError('');
      setPending('story');
      const story = await api.createStory(title);
      setStories((items) => [summarizeStory(story, user ?? undefined), ...items]);
      setNewTitle('');
      setCreating(false);
      setFilter('all');
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
      setFilter('all');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.demoFailed'));
    } finally {
      setPending('');
    }
  }

  async function runChoiceScriptImport(event: FormEvent) {
    event.preventDefault();
    if (pending || importFiles.length === 0 || importSelectionError) return;
    try {
      setImportRequestError('');
      setPending('import');
      const files = await Promise.all(
        importFiles.map(async (file) => ({ name: file.name, content: await file.text() })),
      );
      const outcome = await api.importChoiceScript(files);
      setStories((items) => [summarizeStory(outcome.story, user ?? undefined), ...items]);
      setImportOutcome(outcome);
      setFilter('all');
    } catch (caught) {
      setImportRequestError(caught instanceof Error ? caught.message : t('library.import.failed'));
    } finally {
      setPending('');
    }
  }

  function openChoiceScriptImport() {
    setImportFiles([]);
    setImportOutcome(undefined);
    setImportRequestError('');
    setError('');
    setImporting(true);
  }

  function closeChoiceScriptImport() {
    if (pending === 'import') return;
    setImporting(false);
    setImportFiles([]);
    setImportOutcome(undefined);
    setImportRequestError('');
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
              onClick={openChoiceScriptImport}
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
        <div className="modal-backdrop" role="presentation">
          <section
            className="new-story-dialog choicescript-import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="choicescript-import-title"
          >
            <div className="dialog-icon" aria-hidden="true">
              ⇧
            </div>
            <span className="product-eyebrow">{t('library.import.eyebrow')}</span>
            <h2 id="choicescript-import-title">
              {t(importOutcome ? 'library.import.resultTitle' : 'library.import.title')}
            </h2>
            {importOutcome ? (
              <ChoiceScriptImportResult report={importOutcome.report} />
            ) : (
              <>
                <p>{t('library.import.description')}</p>
                <form onSubmit={(event) => void runChoiceScriptImport(event)}>
                  <label className="product-field choicescript-file-field">
                    <span>{t('library.import.filesLabel')}</span>
                    <input
                      autoFocus
                      multiple
                      accept=".txt,text/plain"
                      type="file"
                      onChange={(event) => {
                        setImportFiles(Array.from(event.currentTarget.files ?? []));
                        setImportOutcome(undefined);
                        setImportRequestError('');
                      }}
                    />
                  </label>
                  {importFiles.length > 0 ? (
                    <div className="choicescript-file-summary" aria-live="polite">
                      <b>{t('library.import.selected', { count: importFiles.length })}</b>
                      <span>{importFiles.map(({ name }) => name).join(', ')}</span>
                      <small>
                        {t('library.import.size', {
                          size: Math.ceil(
                            importFiles.reduce((total, file) => total + file.size, 0) / 1024,
                          ),
                        })}
                      </small>
                    </div>
                  ) : null}
                  {importSelectionError || importRequestError ? (
                    <p className="library-error choicescript-import-error" role="alert">
                      {importSelectionError || importRequestError}
                    </p>
                  ) : null}
                  <p className="choicescript-import-notice">{t('library.import.notice')}</p>
                  <div className="dialog-actions">
                    <button
                      className="product-secondary"
                      type="button"
                      disabled={pending === 'import'}
                      onClick={closeChoiceScriptImport}
                    >
                      {t('library.import.cancel')}
                    </button>
                    <button
                      className="product-primary"
                      type="submit"
                      disabled={
                        importFiles.length === 0 ||
                        Boolean(importSelectionError) ||
                        pending === 'import'
                      }
                    >
                      {t(
                        pending === 'import' ? 'library.import.importing' : 'library.import.submit',
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
            {importOutcome ? (
              <div className="dialog-actions">
                <button
                  className="product-secondary"
                  type="button"
                  onClick={closeChoiceScriptImport}
                >
                  {t('library.import.close')}
                </button>
                <Link
                  className="product-primary"
                  to={`/stories/${importOutcome.story.id}/edit`}
                  onMouseEnter={() => void loadStoryEditor()}
                  onFocus={() => void loadStoryEditor()}
                >
                  {t('library.import.open')}
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ChoiceScriptImportResult({ report }: { report: ChoiceScriptImportReport }) {
  const { t } = useTranslation();
  const warnings = report.issues.filter(({ severity }) => severity === 'warning');
  return (
    <div className="choicescript-import-result">
      <p>{t('library.import.resultDescription')}</p>
      <dl>
        <div>
          <dt>{t('library.import.scenes')}</dt>
          <dd>{report.sceneCount}</dd>
        </div>
        <div>
          <dt>{t('library.import.interactions')}</dt>
          <dd>{report.interactionCount}</dd>
        </div>
        <div>
          <dt>{t('library.import.warnings')}</dt>
          <dd>{warnings.length}</dd>
        </div>
      </dl>
      {warnings.length > 0 ? (
        <div className="choicescript-import-warnings">
          <b>{t('library.import.reviewWarnings')}</b>
          <ul>
            {warnings.slice(0, 8).map((issue, index) => (
              <li key={`${issue.fileName ?? ''}:${issue.line ?? ''}:${issue.code}:${index}`}>
                <span>
                  {[
                    issue.fileName,
                    issue.line ? t('library.import.line', { line: issue.line }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {issue.message}
              </li>
            ))}
          </ul>
          {warnings.length > 8 ? (
            <small>{t('library.import.moreWarnings', { count: warnings.length - 8 })}</small>
          ) : null}
        </div>
      ) : (
        <p className="choicescript-import-clean">{t('library.import.noWarnings')}</p>
      )}
    </div>
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
