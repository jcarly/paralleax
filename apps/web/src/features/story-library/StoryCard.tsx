import { useTranslation } from 'react-i18next';
import type { StorySummary } from '@paralleax/shared';
import { FieldHelpTooltip } from '../../components/FieldHelpTooltip';
import { CanvasActionIcon, type CanvasActionIconName } from '../../components/StoryCanvasToolbar';
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
  const canEdit = story.capabilities?.canEdit === true;
  const canManage = story.capabilities?.canManage === true;
  return (
    <div>
      <StoryCardOpenLinks story={story} canEdit={canEdit} />
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

function StoryCardOpenLinks({ story, canEdit }: { story: StorySummary; canEdit: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <StoryCardIconLink
        className={canEdit ? 'product-secondary' : 'product-primary'}
        icon="play"
        label={t('library.card.read')}
        to={`/stories/${story.id}/play`}
        preload={loadStoryPlayer}
      />
      {canEdit ? (
        <>
          <StoryCardIconLink
            className="product-primary"
            icon="edit"
            label={t('library.card.edit')}
            to={`/stories/${story.id}/edit`}
            preload={loadStoryEditor}
          />
          <StoryCardIconLink
            className="product-ghost"
            icon="export"
            label={t('library.card.export')}
            href={`/api/stories/${encodeURIComponent(story.id)}/export`}
          />
        </>
      ) : null}
    </>
  );
}

/** Icon-only navigation or download link; the name stays accessible and shows in a tooltip. */
function StoryCardIconLink({
  className,
  icon,
  label,
  to,
  href,
  preload,
}: {
  className: string;
  icon: CanvasActionIconName;
  label: string;
  to?: string;
  href?: string;
  preload?: () => Promise<unknown>;
}) {
  return (
    <FieldHelpTooltip
      label={label}
      help={label}
      className={`${className} compact library-card-icon-link`}
      to={to}
      href={href}
      onPreload={
        preload
          ? () => {
              void preload();
            }
          : undefined
      }
    >
      <CanvasActionIcon name={icon} />
    </FieldHelpTooltip>
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
      <StoryCardIconLink
        className="product-ghost"
        icon="access"
        label={t('library.card.access')}
        to={`/stories/${story.id}/edit?settings=access`}
        preload={loadStoryEditor}
      />
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
        <CanvasActionIcon name="delete" />
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
