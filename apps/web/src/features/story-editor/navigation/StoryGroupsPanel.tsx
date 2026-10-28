import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryGroupsPanelProps } from './StoryGroupTreePanel';
import { StoryContextSectionHeader } from './StoryContextSectionHeader';

// Load drag mechanics only for Stories that actually contain Groups.
const GroupTree = lazy(() =>
  import('./StoryGroupTreePanel').then((module) => ({ default: module.StoryGroupTreePanel })),
);

export function StoryGroupsPanel(props: StoryGroupsPanelProps) {
  const { t } = useTranslation();
  const groups = props.story.groups ?? [];
  const open = props.open || Boolean(props.editingGroupId);
  const fallback = (
    <section className="story-groups-panel" aria-label={t('editor.groups.title')}>
      <StoryContextSectionHeader
        title={t('editor.groups.title')}
        count={groups.length}
        countLabel={t('editor.groups.count', { count: groups.length })}
        expanded={open}
        onToggle={props.onToggle}
        toggleDisabled={Boolean(props.editingGroupId)}
        add={
          !props.readOnly
            ? {
                accessibleName: t('editor.groups.add'),
                onClick: props.onAdd,
                disabled: Boolean(props.editingGroupId),
              }
            : undefined
        }
      />
      {open ? (
        <p className="hint">{t(groups.length ? 'shell.loading' : 'editor.groups.empty')}</p>
      ) : null}
    </section>
  );

  return groups.length ? (
    <Suspense fallback={fallback}>
      <GroupTree {...props} />
    </Suspense>
  ) : (
    fallback
  );
}
