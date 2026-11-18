import { useMemo } from 'react';
import {
  commentSemanticSlotKey,
  isCommentAnchorDetached,
  type CommentAnchor,
  type CommentTargetType,
  type CommentTextField,
  type Story,
  type StoryCommentThread,
} from '@paralleax/shared';

export type SelectedCommentTarget = { targetType: CommentTargetType; targetId: string } | undefined;

function projectCommentThreads(story: Story | undefined, threads: StoryCommentThread[]) {
  return story
    ? threads.map((thread) => ({
        ...thread,
        detached: isCommentAnchorDetached(story, thread.anchor),
      }))
    : threads;
}

function selectTargetCommentThreads(threads: StoryCommentThread[], target: SelectedCommentTarget) {
  return target
    ? threads.filter(
        (thread) =>
          thread.anchor.kind !== 'canvas' &&
          thread.anchor.targetType === target.targetType &&
          thread.anchor.targetId === target.targetId,
      )
    : [];
}

function findContextualDraftAnchor(
  draft: CommentAnchor | undefined,
  target: SelectedCommentTarget,
): Exclude<CommentAnchor, { kind: 'canvas' }> | undefined {
  if (!draft || draft.kind === 'canvas' || !target) {
    return undefined;
  }
  return draft.targetType === target.targetType && draft.targetId === target.targetId
    ? draft
    : undefined;
}

function countStoryComments(threads: StoryCommentThread[]) {
  const graph = new Map<string, number>();
  const byTarget = new Map<string, number>();
  for (const thread of threads) {
    if (thread.status !== 'open' || thread.anchor.kind === 'canvas') {
      continue;
    }
    incrementCommentCount(byTarget, `${thread.anchor.targetType}:${thread.anchor.targetId}`);
    if (thread.anchor.targetType === 'interaction' || thread.anchor.targetType === 'trigger') {
      incrementCommentCount(graph, thread.anchor.targetId);
    }
  }
  return { graphCommentCounts: graph, commentCountsByTarget: byTarget };
}

function incrementCommentCount(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countTextComments(threads: StoryCommentThread[]) {
  return threads.reduce<Partial<Record<CommentTextField, number>>>((counts, thread) => {
    if (thread.status === 'open' && thread.anchor.kind === 'text') {
      counts[thread.anchor.field] = (counts[thread.anchor.field] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function countSemanticComments(threads: StoryCommentThread[]) {
  return threads.reduce<Partial<Record<string, number>>>((counts, thread) => {
    if (thread.status === 'open' && isSemanticCommentAnchor(thread.anchor)) {
      const key = commentSemanticSlotKey(thread.anchor);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, {});
}

export function isSemanticCommentAnchor(
  anchor: CommentAnchor,
): anchor is Extract<CommentAnchor, { kind: 'field' | 'section' }> {
  return anchor.kind === 'field' || anchor.kind === 'section';
}

export function useStoryEditorCommentProjection(input: {
  story: Story | undefined;
  commentThreads: StoryCommentThread[];
  selectedCommentTarget: SelectedCommentTarget;
  draftAnchor: CommentAnchor | undefined;
}) {
  const projectedCommentThreads = useMemo(
    () => projectCommentThreads(input.story, input.commentThreads),
    [input.commentThreads, input.story],
  );
  const activeCommentThreads = useMemo(
    () =>
      projectedCommentThreads.filter(
        (thread) => thread.deletedAt === undefined || thread.deletedAt.length === 0,
      ),
    [projectedCommentThreads],
  );
  const selectedTargetThreads = useMemo(
    () => selectTargetCommentThreads(activeCommentThreads, input.selectedCommentTarget),
    [activeCommentThreads, input.selectedCommentTarget],
  );
  const contextualDraftAnchor = useMemo(
    () => findContextualDraftAnchor(input.draftAnchor, input.selectedCommentTarget),
    [input.draftAnchor, input.selectedCommentTarget],
  );
  const counts = useMemo(() => countStoryComments(activeCommentThreads), [activeCommentThreads]);
  return {
    projectedCommentThreads,
    activeCommentThreads,
    selectedTargetThreads,
    contextualDraftAnchor,
    counts,
  };
}

export function useStoryEditorCommentSummary(input: {
  commentsOpen: boolean;
  contextualCommentsTargetKey: string | undefined;
  hasInspectorSelection: boolean;
  selectedCommentTarget: SelectedCommentTarget;
  selectedTargetThreads: StoryCommentThread[];
  contextualDraftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined;
  counts: ReturnType<typeof countStoryComments>;
}) {
  const selectedTextCommentCounts = useMemo(
    () => countTextComments(input.selectedTargetThreads),
    [input.selectedTargetThreads],
  );
  const selectedSemanticCommentCounts = useMemo(
    () => countSemanticComments(input.selectedTargetThreads),
    [input.selectedTargetThreads],
  );
  const selectedCommentTargetKey = input.selectedCommentTarget
    ? `${input.selectedCommentTarget.targetType}:${input.selectedCommentTarget.targetId}`
    : undefined;
  const selectedTargetCommentCount = getCommentTargetCount(
    input.counts.commentCountsByTarget,
    selectedCommentTargetKey,
  );
  const showContextualComments = isContextualCommentsOpen(
    input.commentsOpen,
    selectedCommentTargetKey,
    input.contextualCommentsTargetKey,
    input.contextualDraftAnchor,
  );
  return {
    selectedTargetCommentCount,
    selectedTextCommentCounts,
    selectedSemanticCommentCounts,
    selectedCommentTargetKey,
    showContextualComments,
    hasInspector: input.commentsOpen || input.hasInspectorSelection,
  };
}

function getCommentTargetCount(counts: ReadonlyMap<string, number>, key: string | undefined) {
  return key !== undefined && key.length > 0 ? (counts.get(key) ?? 0) : 0;
}

function isContextualCommentsOpen(
  commentsOpen: boolean,
  selectedTargetKey: string | undefined,
  contextualTargetKey: string | undefined,
  draftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined,
) {
  return Boolean(
    !commentsOpen &&
    selectedTargetKey !== undefined &&
    selectedTargetKey.length > 0 &&
    (contextualTargetKey === selectedTargetKey || draftAnchor),
  );
}
