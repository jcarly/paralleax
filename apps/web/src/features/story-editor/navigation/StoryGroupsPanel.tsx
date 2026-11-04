import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryGroupsPanelProps } from './storyGroupTypes';
import { StoryContextSectionHeader } from './StoryContextSectionHeader';
import { UngroupedInteractionList } from './UngroupedInteractionList';

const GroupTree = lazy(() =>
  import('./StoryGroupTreePanel').then((module) => ({ default: module.StoryGroupTreePanel })),
);

export function StoryGroupsPanel(props: StoryGroupsPanelProps) {
  const groups = props.story.groups ?? [];
  if (!groups.length) {
    return <GroupsWithoutTree props={props} />;
  }
  return (
    <Suspense fallback={<GroupsLoadingFallback props={props} />}>
      <GroupTree {...props} />
    </Suspense>
  );
}

function GroupsWithoutTree({ props }: { props: StoryGroupsPanelProps }) {
  const { t } = useTranslation();
  const interactions = props.story.interactions.filter(({ id }) => !isGrouped(props, id));
  const hasSearchResults = props.matchingInteractionIds.length > 0;
  const open = props.open || Boolean(props.editingGroupId);

  return (
    <section className="story-groups-panel" aria-label={t('editor.groups.title')}>
      <GroupsHeader props={props} count={0} />
      {open ? (
        <>
          <p className="hint">
            {props.searchQuery.trim() && !hasSearchResults
              ? t('editor.groups.noMatches')
              : t('editor.groups.empty')}
          </p>
          <UngroupedInteractionList
            interactions={interactions}
            searchQuery={props.searchQuery}
            matchingInteractionIds={new Set(props.matchingInteractionIds)}
            selectedInteractionId={props.selectedInteractionId}
            onSelect={props.onSelectInteraction}
          />
        </>
      ) : null}
    </section>
  );
}

function GroupsLoadingFallback({ props }: { props: StoryGroupsPanelProps }) {
  const { t } = useTranslation();
  return (
    <section className="story-groups-panel" aria-label={t('editor.groups.title')}>
      <GroupsHeader props={props} count={props.story.groups?.length ?? 0} />
      {props.open || props.editingGroupId ? <p className="hint">{t('shell.loading')}</p> : null}
    </section>
  );
}

function GroupsHeader({ props, count }: { props: StoryGroupsPanelProps; count: number }) {
  const { t } = useTranslation();
  const open = props.open || Boolean(props.editingGroupId);
  return (
    <StoryContextSectionHeader
      title={t('editor.groups.title')}
      count={count}
      countLabel={t('editor.groups.count', { count })}
      expanded={open}
      onToggle={props.onToggle}
      toggleDisabled={Boolean(props.editingGroupId)}
      add={
        props.readOnly
          ? undefined
          : {
              accessibleName: t('editor.groups.add'),
              onClick: props.onAdd,
              disabled: Boolean(props.editingGroupId),
            }
      }
    />
  );
}

function isGrouped(props: StoryGroupsPanelProps, interactionId: string) {
  return props.story.groups?.some(({ interactionIds }) => interactionIds.includes(interactionId));
}
