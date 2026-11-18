import {
  commentSemanticSlotKey,
  isCommentAnchor,
  type CommentAnchor,
  type CommentSemanticSlot,
  type CommentTargetType,
  type CommentTextField,
  type Story,
  type StoryCommentThread,
} from '@paralleax/shared';
import { captureActiveTextSelection } from './textAnchors';
import type { useStoryComments } from './useStoryComments';
import {
  isSemanticCommentAnchor,
  type SelectedCommentTarget,
} from './useStoryEditorCommentProjection';

function buildSemanticCommentAnchor(
  target: { targetType: CommentTargetType; targetId: string },
  slot: CommentSemanticSlot,
): CommentAnchor | undefined {
  const anchor =
    slot.kind === 'field'
      ? { kind: 'field', ...target, field: slot.field }
      : { kind: 'section', ...target, section: slot.section };
  return isCommentAnchor(anchor) ? anchor : undefined;
}

type StoryEditorCommentActionInput = {
  story: Story | undefined;
  comments: ReturnType<typeof useStoryComments>;
  selectedCommentTarget: SelectedCommentTarget;
  selectedCommentTargetKey: string | undefined;
  selectedTargetThreads: StoryCommentThread[];
  showContextualComments: boolean;
  setCommentsOpen: (open: boolean) => void;
  setContextualCommentsTargetKey: (key: string | undefined) => void;
};

function openEntityCommentThread(
  input: StoryEditorCommentActionInput,
  targetType: CommentTargetType,
  targetId: string,
) {
  if (input.story?.capabilities?.canComment !== true) {
    return;
  }
  input.comments.startThread({ kind: 'entity', targetType, targetId });
  input.comments.selectThread(undefined);
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(`${targetType}:${targetId}`);
}

function resetContextualCommentState(input: StoryEditorCommentActionInput) {
  input.comments.cancelDraft();
  input.comments.selectThread(undefined);
  input.setContextualCommentsTargetKey(undefined);
}

function toggleStoryContextualComments(input: StoryEditorCommentActionInput) {
  if (input.showContextualComments) {
    resetContextualCommentState(input);
    return;
  }
  if (input.selectedTargetThreads.length > 0) {
    input.comments.cancelDraft();
    input.comments.selectThread(undefined);
    input.setCommentsOpen(false);
    input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
    return;
  }
  if (input.selectedCommentTarget) {
    openEntityCommentThread(
      input,
      input.selectedCommentTarget.targetType,
      input.selectedCommentTarget.targetId,
    );
  }
}

function selectTextCommentThread(input: StoryEditorCommentActionInput, field: CommentTextField) {
  if (input.selectedCommentTargetKey === undefined || input.selectedCommentTargetKey.length === 0) {
    return;
  }
  const thread =
    input.selectedTargetThreads.find(
      (candidate) =>
        candidate.status === 'open' &&
        candidate.anchor.kind === 'text' &&
        candidate.anchor.field === field,
    ) ??
    input.selectedTargetThreads.find(
      (candidate) => candidate.anchor.kind === 'text' && candidate.anchor.field === field,
    );
  if (!thread) {
    return;
  }
  input.comments.cancelDraft();
  input.comments.selectThread(thread.id);
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
}

function selectSemanticCommentThread(
  input: StoryEditorCommentActionInput,
  slot: CommentSemanticSlot,
) {
  if (!input.selectedCommentTarget || input.story?.capabilities?.canComment !== true) {
    return;
  }
  const key = commentSemanticSlotKey(slot);
  const thread = findSemanticCommentThread(input.selectedTargetThreads, slot, key);
  if (thread) {
    input.comments.cancelDraft();
    input.comments.selectThread(thread.id);
  } else {
    const anchor = buildSemanticCommentAnchor(input.selectedCommentTarget, slot);
    if (anchor) {
      input.comments.startThread(anchor);
    }
    input.comments.selectThread(undefined);
  }
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
}

function findSemanticCommentThread(
  threads: StoryCommentThread[],
  slot: CommentSemanticSlot,
  key: string,
) {
  const matchesSlot = (thread: StoryCommentThread) =>
    isSemanticCommentAnchor(thread.anchor) &&
    thread.anchor.kind === slot.kind &&
    commentSemanticSlotKey(thread.anchor) === key;
  return (
    threads.find((thread) => thread.status === 'open' && matchesSlot(thread)) ??
    threads.find(matchesSlot)
  );
}

function startStoryTextComment(input: StoryEditorCommentActionInput) {
  if (!input.selectedCommentTarget || input.story?.capabilities?.canComment !== true) {
    return;
  }
  const selection = captureActiveTextSelection();
  if (!selection) {
    return;
  }
  input.comments.startThread({
    kind: 'text',
    ...input.selectedCommentTarget,
    field: selection.field,
    selector: selection.selector,
  });
  input.comments.selectThread(undefined);
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
}

async function reattachStoryCommentThread(
  input: Pick<StoryEditorCommentActionInput, 'comments' | 'selectedCommentTarget'>,
  threadId: string,
) {
  if (!input.selectedCommentTarget) {
    return;
  }
  const selection = captureActiveTextSelection();
  await input.comments.reanchor(
    threadId,
    selection
      ? {
          kind: 'text',
          ...input.selectedCommentTarget,
          field: selection.field,
          selector: selection.selector,
        }
      : { kind: 'entity', ...input.selectedCommentTarget },
  );
}

export function bindStoryEditorCommentActions(input: StoryEditorCommentActionInput) {
  return {
    startEntityCommentForTarget: (targetType: CommentTargetType, targetId: string) => {
      openEntityCommentThread(input, targetType, targetId);
    },
    startEntityComment: () => {
      if (input.selectedCommentTarget) {
        openEntityCommentThread(
          input,
          input.selectedCommentTarget.targetType,
          input.selectedCommentTarget.targetId,
        );
      }
    },
    closeContextualComments: () => {
      resetContextualCommentState(input);
    },
    toggleContextualComments: () => {
      toggleStoryContextualComments(input);
    },
    openTextComments: (field: CommentTextField) => {
      selectTextCommentThread(input, field);
    },
    openSemanticComments: (slot: CommentSemanticSlot) => {
      selectSemanticCommentThread(input, slot);
    },
    startTextComment: () => {
      startStoryTextComment(input);
    },
    reattachSelectedThread: (threadId: string) => reattachStoryCommentThread(input, threadId),
  };
}
