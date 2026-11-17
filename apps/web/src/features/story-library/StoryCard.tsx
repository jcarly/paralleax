import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { StorySummary } from '@paralleax/shared';
import { FieldHelpTooltip } from '../../components/FieldHelpTooltip';
import { loadStoryEditor, loadStoryPlayer } from '../../pages/storyRouteLoaders';

export function StoryCard({
  story,
  remove,
  deleting,
  deleteDisabled,
}: {
  story: StorySummary;
  remove: (id: string) => Promise<void>;
  deleting: boolean;
  deleteDisabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <article className="library-card">
      <div className="library-card-body">
        <span className="product-badge neutral">
          {t(`library.card.visibility.${story.access?.visibility ?? 'private'}`)}
        </span>
        <h2>{story.title}</h2>
        {story.owner ? (
          <span className="library-card-author">
            {t('library.card.author', { name: story.owner.displayName })}
          </span>
        ) : null}
      </div>
      <footer>
        <time dateTime={story.updatedAt}>
          {t('library.card.edited', {
            date: formatDate(story.updatedAt, locale, t('library.card.unknownDate')),
          })}
        </time>
        <StoryCardActions
          story={story}
          remove={remove}
          deleting={deleting}
          deleteDisabled={deleteDisabled}
        />
      </footer>
    </article>
  );
}

function StoryCardActions({
  story,
  remove,
  deleting,
  deleteDisabled,
}: {
  story: StorySummary;
  remove: (id: string) => Promise<void>;
  deleting: boolean;
  deleteDisabled: boolean;
}) {
  const { t } = useTranslation();
  const canEdit = story.capabilities?.canEdit === true;
  const canManage = story.capabilities?.canManage === true;
  return (
    <div>
      <Link
        className={`${canEdit ? 'product-secondary' : 'product-primary'} compact`}
        to={`/stories/${story.id}/play`}
        onMouseEnter={() => void loadStoryPlayer()}
        onFocus={() => void loadStoryPlayer()}
      >
        {t('library.card.read')}
      </Link>
      {canEdit ? <StoryEditLink storyId={story.id} label={t('library.card.edit')} /> : null}
      {canManage ? (
        <StoryManageActions
          story={story}
          remove={remove}
          deleting={deleting}
          deleteDisabled={deleteDisabled}
        />
      ) : null}
    </div>
  );
}

function StoryEditLink({ storyId, label }: { storyId: string; label: string }) {
  return (
    <Link
      className="product-primary compact"
      to={`/stories/${storyId}/edit`}
      onMouseEnter={() => void loadStoryEditor()}
      onFocus={() => void loadStoryEditor()}
    >
      {label} <span aria-hidden="true">→</span>
    </Link>
  );
}

function StoryManageActions({
  story,
  remove,
  deleting,
  deleteDisabled,
}: {
  story: StorySummary;
  remove: (id: string) => Promise<void>;
  deleting: boolean;
  deleteDisabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Link
        className="product-ghost compact"
        to={`/stories/${story.id}/edit?settings=access`}
        onMouseEnter={() => void loadStoryEditor()}
        onFocus={() => void loadStoryEditor()}
      >
        {t('library.card.access')}
      </Link>
      <FieldHelpTooltip
        label={t(deleting ? 'library.card.deleting' : 'library.card.delete')}
        help={t('library.card.deleteTooltip')}
        className="product-ghost danger-text compact library-card-delete"
        disabled={deleteDisabled}
        onClick={() => {
          confirmStoryDeletion(
            story,
            remove,
            t('library.card.deleteConfirm', { title: story.title }),
          );
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </FieldHelpTooltip>
    </>
  );
}

function confirmStoryDeletion(
  story: StorySummary,
  remove: (id: string) => Promise<void>,
  message: string,
) {
  if (window.confirm(message)) {
    void remove(story.id);
  }
}

function formatDate(value: string, locale: string, unknownDate: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return unknownDate;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
