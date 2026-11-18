import {
  useCallback,
  type Dispatch,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { Story } from '@paralleax/shared';
import { useStoryContextNavigation } from '../navigation/useStoryContextNavigation';
import type {
  useStoryEditorSelection,
  StoryEditorExclusiveSelection,
} from './useStoryEditorSelection';

type StoryEditorSelectionActionsInput = {
  selection: ReturnType<typeof useStoryEditorSelection>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
};

function useStoryEditorPrimarySelectionActions({
  selection,
  setCommentsOpen,
  setContextualCommentsTargetKey,
}: StoryEditorSelectionActionsInput) {
  const selectEditorExclusive = selection.selectExclusive;
  const selectEditorInteraction = selection.selectInteraction;
  const focusEditorInteraction = selection.focusInteraction;
  const selectExclusive = useCallback(
    (nextSelection?: StoryEditorExclusiveSelection) => {
      if (nextSelection) {
        setCommentsOpen(false);
      }
      setContextualCommentsTargetKey(undefined);
      selectEditorExclusive(nextSelection);
    },
    [selectEditorExclusive, setCommentsOpen, setContextualCommentsTargetKey],
  );
  const selectInteraction = useCallback(
    (interactionId: string) => {
      setCommentsOpen(false);
      setContextualCommentsTargetKey(undefined);
      selectEditorInteraction(interactionId);
    },
    [selectEditorInteraction, setCommentsOpen, setContextualCommentsTargetKey],
  );
  const focusInteraction = useCallback(
    (interactionId: string) => {
      setCommentsOpen(false);
      setContextualCommentsTargetKey(undefined);
      focusEditorInteraction(interactionId);
    },
    [focusEditorInteraction, setCommentsOpen, setContextualCommentsTargetKey],
  );
  return { selectExclusive, selectInteraction, focusInteraction };
}

function useStoryEditorSelectionResetActions({
  selection,
  setCommentsOpen,
  setContextualCommentsTargetKey,
}: StoryEditorSelectionActionsInput) {
  const clearSelection = selection.clearSelection;
  const startGraphSelection = selection.handleGraphSelectionStart;
  const closeInspector = useCallback(() => {
    setContextualCommentsTargetKey(undefined);
    clearSelection();
  }, [clearSelection, setContextualCommentsTargetKey]);
  const handleGraphSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      setCommentsOpen(false);
      setContextualCommentsTargetKey(undefined);
      startGraphSelection(event);
    },
    [startGraphSelection, setCommentsOpen, setContextualCommentsTargetKey],
  );
  return { closeInspector, handleGraphSelectionStart };
}

export function useStoryEditorSelectionActions(input: StoryEditorSelectionActionsInput) {
  return {
    ...useStoryEditorPrimarySelectionActions(input),
    ...useStoryEditorSelectionResetActions(input),
  };
}

type StoryEditorNavigationInput = {
  story?: Story;
  selection: ReturnType<typeof useStoryEditorSelection>;
  flowInstanceRef: Parameters<typeof useStoryContextNavigation>[0]['flowInstanceRef'];
  selectInteraction: (interactionId: string) => void;
  focusInteraction: (interactionId: string) => void;
};

export function useStoryEditorNavigation({
  story,
  selection,
  flowInstanceRef,
  selectInteraction,
  focusInteraction,
}: StoryEditorNavigationInput) {
  const contextNavigation = useStoryContextNavigation({
    story,
    selectedId: selection.selectedId,
    selectedContextReference: selection.selectedContextReference,
    flowInstanceRef,
    selectInteraction,
    focusInteraction,
  });
  const emphasizedInteractionIds =
    selection.groupInteractionIds ?? contextNavigation.emphasizedInteractionIds;
  return { contextNavigation, emphasizedInteractionIds };
}
