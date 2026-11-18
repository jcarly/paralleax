import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { useTranslation } from 'react-i18next';
import type { ReactFlowInstance } from '@xyflow/react';
import type { CommentTargetType, Story, StoryCommentThread } from '@paralleax/shared';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import { getReferencedInteractionIds, type StoryContextReference } from '../../../storyNavigation';
import type { StoryEditorExclusiveSelection } from '../selection/useStoryEditorSelection';
import type { useStoryComments } from '../../comments/useStoryComments';

type CommentThreadFocus = {
  selection?: StoryEditorExclusiveSelection;
  graphNodeIds: string[];
  clearSelection: boolean;
};

function commentTargetKey(anchor: StoryCommentThread['anchor']) {
  return anchor.kind === 'canvas' ? undefined : anchor.targetType + ':' + anchor.targetId;
}

function resolveCommentThreadFocus(
  thread: StoryCommentThread,
  story: Story | undefined,
): CommentThreadFocus {
  const anchor = thread.anchor;
  if (anchor.kind === 'canvas') {
    return { graphNodeIds: ['comment:' + thread.id], clearSelection: true };
  }
  if (anchor.targetType === 'trigger') {
    return resolveTriggerCommentFocus(anchor.targetId, story);
  }

  const selection = selectionForCommentTarget(anchor.targetType, anchor.targetId);
  const referenceType = referenceTypeForCommentTarget(anchor.targetType);
  const graphNodeIds = referenceType
    ? getReferencedInteractionIds(story, { type: referenceType, id: anchor.targetId })
    : [anchor.targetId];
  return { selection, graphNodeIds, clearSelection: false };
}

function resolveTriggerCommentFocus(
  triggerId: string,
  story: Story | undefined,
): CommentThreadFocus {
  const owner = story?.interactions.find((interaction) =>
    interaction.triggers.some(({ id }) => id === triggerId),
  );
  if (!owner) {
    return { graphNodeIds: [], clearSelection: true };
  }
  return {
    selection: { type: 'trigger', trigger: { interactionId: owner.id, triggerId } },
    graphNodeIds: [owner.id],
    clearSelection: false,
  };
}

function selectionForCommentTarget(
  targetType: Exclude<CommentTargetType, 'trigger'>,
  targetId: string,
): StoryEditorExclusiveSelection {
  switch (targetType) {
    case 'interaction':
      return { type: 'interaction', id: targetId };
    case 'location':
      return { type: 'location', id: targetId };
    case 'character':
      return { type: 'character', id: targetId };
    case 'statDefinition':
      return { type: 'statDefinition', id: targetId };
    case 'itemDefinition':
      return { type: 'itemDefinition', id: targetId };
  }
}

function referenceTypeForCommentTarget(
  targetType: Exclude<CommentTargetType, 'trigger'>,
): StoryContextReference['type'] | undefined {
  switch (targetType) {
    case 'interaction':
      return undefined;
    case 'location':
      return 'location';
    case 'character':
      return 'character';
    case 'statDefinition':
      return 'stat';
    case 'itemDefinition':
      return 'item';
  }
}

function focusGraphNodes(
  nodeIds: string[],
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
) {
  if (nodeIds.length === 0) {
    return;
  }
  window.requestAnimationFrame(() => {
    void getFlowInstance()?.fitView({
      nodes: nodeIds.map((id) => ({ id })),
      duration: 250,
      padding: 0.7,
      maxZoom: 1,
    });
  });
}

type StoryEditorCommentFocusInput = {
  threads: StoryCommentThread[];
  story?: Story;
  selectCommentThread: (threadId?: string) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  closeInspector: () => void;
  selectEditorExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
};

export function useStoryEditorCommentFocusActions({
  threads,
  story,
  selectCommentThread,
  setCommentsOpen,
  setContextualCommentsTargetKey,
  closeInspector,
  selectEditorExclusive,
  getFlowInstance,
}: StoryEditorCommentFocusInput) {
  return useCallback(
    (threadId: string) => {
      const thread = threads.find(({ id }) => id === threadId);
      if (!thread) {
        return;
      }
      selectCommentThread(thread.id);
      setCommentsOpen(false);
      setContextualCommentsTargetKey(commentTargetKey(thread.anchor));
      const focus = resolveCommentThreadFocus(thread, story);
      if (focus.clearSelection) {
        closeInspector();
      } else if (focus.selection) {
        selectEditorExclusive(focus.selection);
      }
      focusGraphNodes(focus.graphNodeIds, getFlowInstance);
    },
    [
      closeInspector,
      getFlowInstance,
      selectCommentThread,
      selectEditorExclusive,
      setCommentsOpen,
      setContextualCommentsTargetKey,
      story,
      threads,
    ],
  );
}

function resolveCommentTargetSelection(
  targetType: CommentTargetType,
  targetId: string,
  story?: Story,
): StoryEditorExclusiveSelection | undefined {
  if (targetType === 'interaction') {
    return { type: 'interaction', id: targetId };
  }
  if (targetType === 'location') {
    return { type: 'location', id: targetId };
  }
  if (targetType === 'character') {
    return { type: 'character', id: targetId };
  }
  if (targetType === 'statDefinition') {
    return { type: 'statDefinition', id: targetId };
  }
  if (targetType === 'itemDefinition') {
    return { type: 'itemDefinition', id: targetId };
  }
  const owner = story?.interactions.find((interaction) =>
    interaction.triggers.some(({ id }) => id === targetId),
  );
  return owner
    ? { type: 'trigger', trigger: { interactionId: owner.id, triggerId: targetId } }
    : undefined;
}

type StoryEditorCommentTargetInput = {
  activeThreads: StoryCommentThread[];
  story?: Story;
  selectCommentThread: (threadId?: string) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  selectEditorExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  closeInspector: () => void;
};

export function useStoryEditorCommentTargetActions({
  activeThreads,
  story,
  selectCommentThread,
  setCommentsOpen,
  setContextualCommentsTargetKey,
  selectEditorExclusive,
  closeInspector,
}: StoryEditorCommentTargetInput) {
  return useCallback(
    (targetType: CommentTargetType, targetId: string) => {
      const thread = activeThreads.find(
        (candidate) =>
          candidate.status === 'open' &&
          candidate.anchor.kind !== 'canvas' &&
          candidate.anchor.targetType === targetType &&
          candidate.anchor.targetId === targetId,
      );
      if (!thread) {
        return;
      }
      selectCommentThread(undefined);
      setCommentsOpen(false);
      setContextualCommentsTargetKey(`${targetType}:${targetId}`);
      const selection = resolveCommentTargetSelection(targetType, targetId, story);
      if (selection) {
        selectEditorExclusive(selection);
      } else {
        closeInspector();
      }
    },
    [
      activeThreads,
      closeInspector,
      selectCommentThread,
      selectEditorExclusive,
      setCommentsOpen,
      setContextualCommentsTargetKey,
      story,
    ],
  );
}

export function useStoryEditorCommentDeletionActions(
  t: ReturnType<typeof useTranslation>['t'],
  comments: ReturnType<typeof useStoryComments>,
  selectCommentThread: (threadId?: string) => void,
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>,
) {
  const deleteThread = comments.deleteThread;
  const cancelDraft = comments.cancelDraft;
  const restoreThread = comments.restoreThread;
  const deleteCommentThread = useCallback(
    async (threadId: string) => {
      if (!window.confirm(t('comments.confirmDelete'))) {
        return;
      }
      const deleted = await deleteThread(threadId);
      if (!deleted) {
        return;
      }
      cancelDraft();
      selectCommentThread(undefined);
      setContextualCommentsTargetKey(undefined);
      return deleted;
    },
    [cancelDraft, deleteThread, selectCommentThread, setContextualCommentsTargetKey, t],
  );
  const restoreCommentThread = useCallback(
    (threadId: string) => restoreThread(threadId),
    [restoreThread],
  );
  return { deleteCommentThread, restoreCommentThread };
}
