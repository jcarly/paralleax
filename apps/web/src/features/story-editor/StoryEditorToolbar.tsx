import type { Dispatch, SetStateAction } from 'react';
import type { useTranslation } from 'react-i18next';
import type { Interaction, Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../hooks/useStoryEditorPersistence';
import type { useStoryComments } from '../comments/useStoryComments';
import type { StorySettingsTab } from '../story-settings/StorySettingsDialog';
import { StorySettingsIcon } from '../story-settings/StorySettingsIcon';
import { EditorToolbarActions } from './EditorToolbarActions';

type StoryTitleControlProps = {
  story: Story;
  reviewOnly: boolean;
  setStory: (story: Story) => void;
  renameStory: ReturnType<typeof useStoryEditorPersistence>['renameStory'];
  settingsTriggerRef: { current: HTMLButtonElement | null };
  setStorySettingsTab: Dispatch<SetStateAction<StorySettingsTab | undefined>>;
  t: ReturnType<typeof useTranslation>['t'];
};

function StoryTitleControl({
  story,
  reviewOnly,
  setStory,
  renameStory,
  settingsTriggerRef,
  setStorySettingsTab,
  t,
}: StoryTitleControlProps) {
  return (
    <div className="story-title-control">
      {/* eslint-disable-next-line design-system/require-shared-form-control -- the inline Story title uses a display-heading editor */}
      <input
        aria-label={t('editor.storyTitle')}
        className="story-title-input"
        value={story.title}
        readOnly={reviewOnly}
        onChange={(event) => {
          if (!reviewOnly) {
            setStory({ ...story, title: event.target.value });
          }
        }}
        onBlur={(event) => {
          if (!reviewOnly) {
            void renameStory(event.target.value);
          }
        }}
      />
      {!reviewOnly ? (
        <button
          ref={settingsTriggerRef}
          className="canvas-tool-action editor-toolbar-icon-action story-settings-button"
          type="button"
          aria-label={t('storySettings.open')}
          data-tooltip={t('storySettings.open')}
          title={t('storySettings.open')}
          onClick={() => {
            setStorySettingsTab('properties');
          }}
        >
          <StorySettingsIcon />
        </button>
      ) : null}
    </div>
  );
}

type StoryEditorActionsProps = {
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  commentAccess: boolean;
  commentsOpen: boolean;
  toggleCommentsList: () => void;
  realtimeStatus: ReturnType<typeof useStoryEditorPersistence>['realtimeStatus'];
  saveStatus: ReturnType<typeof useStoryEditorPersistence>['saveStatus'];
  reviewOnly: boolean;
  storyId: string;
  simulationFromStartPath: string;
  simulationPath: string;
  selected: Interaction | undefined;
  startingInteraction: Interaction | undefined;
  comments: Pick<ReturnType<typeof useStoryComments>, 'threads'>;
  t: ReturnType<typeof useTranslation>['t'];
};

function StoryEditorActions(props: StoryEditorActionsProps) {
  return (
    <EditorToolbarActions
      loadLabel={
        props.loadPhase !== 'ready' ? props.t(`editor.loadingPhase.${props.loadPhase}`) : undefined
      }
      commentAccess={props.commentAccess}
      commentsOpen={props.commentsOpen}
      openCommentCount={
        props.comments.threads.filter(
          ({ status, deletedAt }) =>
            status === 'open' && (deletedAt === undefined || deletedAt.length === 0),
        ).length
      }
      onToggleComments={props.toggleCommentsList}
      reviewOnly={props.reviewOnly}
      readerPath={`/stories/${props.storyId}/play`}
      saveStatus={props.saveStatus}
      realtimeStatus={props.realtimeStatus}
      simulationFromStartPath={props.simulationFromStartPath}
      simulationPath={props.simulationPath}
      hasCurrentSimulationTarget={Boolean(
        props.selected && props.selected.id !== props.startingInteraction?.id,
      )}
    />
  );
}

export function StoryEditorToolbar(props: StoryTitleControlProps & StoryEditorActionsProps) {
  return (
    <div className="editor-toolbar">
      <StoryTitleControl {...props} />
      <StoryEditorActions {...props} />
    </div>
  );
}
