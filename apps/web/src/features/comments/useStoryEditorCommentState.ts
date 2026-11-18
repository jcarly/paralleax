import { useCallback } from 'react';
import {
  canDeleteCommentThread as canActorDeleteCommentThread,
  canManageCommentThread as canActorManageCommentThread,
  type Story,
  type StoryCommentThread,
} from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../hooks/useStoryEditorPersistence';
import type { useStoryEditorSelection } from '../story-editor/selection/useStoryEditorSelection';
import { useStoryComments } from './useStoryComments';
import {
  useStoryEditorCommentProjection,
  useStoryEditorCommentSummary,
} from './useStoryEditorCommentProjection';

type StoryEditorCommentsInput = {
  storyId: string;
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  commentsOpen: boolean;
  contextualCommentsTargetKey?: string;
  hasInspectorSelection: boolean;
  selectedCommentTarget?: ReturnType<typeof useStoryEditorSelection>['selectedCommentTarget'];
};

function useStoryEditorComments({
  storyId,
  story,
  loadPhase,
  commentsOpen,
  contextualCommentsTargetKey,
  hasInspectorSelection,
  selectedCommentTarget,
}: StoryEditorCommentsInput) {
  const commentAccess = loadPhase === 'ready' && story?.capabilities?.canEdit === true;
  const reviewOnly = loadPhase !== 'ready' || story?.capabilities?.canEdit === false;
  const comments = useStoryComments(storyId, commentAccess);
  const commentProjection = useStoryEditorCommentProjection({
    story,
    commentThreads: comments.threads,
    selectedCommentTarget,
    draftAnchor: comments.draftAnchor,
  });
  const commentSummary = useStoryEditorCommentSummary({
    commentsOpen,
    contextualCommentsTargetKey,
    hasInspectorSelection,
    selectedCommentTarget,
    selectedTargetThreads: commentProjection.selectedTargetThreads,
    contextualDraftAnchor: commentProjection.contextualDraftAnchor,
    counts: commentProjection.counts,
  });
  return { comments, commentProjection, commentSummary, reviewOnly, commentAccess };
}

function useStoryEditorCommentPermissions(story: Story | undefined, currentUserId?: string) {
  const canManageCommentThread = useCallback(
    (thread: StoryCommentThread) =>
      canActorManageCommentThread(story?.capabilities, currentUserId, thread),
    [currentUserId, story?.capabilities],
  );
  const canDeleteCommentThread = useCallback(
    (thread: StoryCommentThread) =>
      canActorDeleteCommentThread(story?.capabilities, currentUserId, thread),
    [currentUserId, story?.capabilities],
  );
  return { canManageCommentThread, canDeleteCommentThread };
}

export function useStoryEditorCommentStateRuntime(
  input: StoryEditorCommentsInput & { currentUserId?: string },
) {
  const commentsModel = useStoryEditorComments(input);
  const permissions = useStoryEditorCommentPermissions(input.story, input.currentUserId);
  return {
    ...commentsModel,
    ...permissions,
    selectCommentThread: commentsModel.comments.selectThread,
  };
}
