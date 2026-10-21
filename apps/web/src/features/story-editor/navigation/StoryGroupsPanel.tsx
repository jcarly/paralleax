import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryGroupsPanelProps } from './StoryGroupTreePanel';

// Load drag mechanics only for Stories that actually contain Groups.
const GroupTree = lazy(() =>
  import('./StoryGroupTreePanel').then((module) => ({ default: module.StoryGroupTreePanel })),
);
export function StoryGroupsPanel(props: StoryGroupsPanelProps) {
  const { t } = useTranslation();
  const fallback = (
    <section className="story-groups-panel" aria-label={t('editor.groups.title')}>
      <div className="location-panel-header">
        <span className="context-heading">
          <span className="context-heading-label">{t('editor.groups.title')}</span>
          <small>{props.story.groups?.length ?? 0}</small>
        </span>
      </div>
      <p className="hint">
        {t(props.story.groups?.length ? 'shell.loading' : 'editor.groups.empty')}
      </p>
    </section>
  );
  return props.story.groups?.length ? (
    <Suspense fallback={fallback}>
      <GroupTree {...props} />
    </Suspense>
  ) : (
    fallback
  );
}
