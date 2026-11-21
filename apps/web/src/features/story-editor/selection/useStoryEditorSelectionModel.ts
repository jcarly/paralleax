import type { Dispatch, SetStateAction } from 'react';
import type { Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import { useStoryEditorSelection } from './useStoryEditorSelection';
import { useStoryEditorOnboardingEffects } from './useStoryEditorOnboardingEffects';
import {
  useStoryEditorNavigation,
  useStoryEditorSelectionActions,
} from './useStoryEditorSelectionActions';

type StoryEditorInteractionStateInput = {
  storyId: string;
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  storyRouteInaccessible: boolean;
  flowInstanceRef: Parameters<typeof useStoryEditorNavigation>[0]['flowInstanceRef'];
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
};

function useStoryEditorInteractionState(input: StoryEditorInteractionStateInput) {
  const editorSelection = useStoryEditorSelection(input.story);
  const selectionActions = useStoryEditorSelectionActions({
    selection: editorSelection,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
  });
  const navigation = useStoryEditorNavigation({
    story: input.story,
    selection: editorSelection,
    flowInstanceRef: input.flowInstanceRef,
    selectInteraction: selectionActions.selectInteraction,
    focusInteraction: selectionActions.focusInteraction,
  });
  const onboarding = useStoryEditorOnboardingEffects({
    storyId: input.storyId,
    story: input.story,
    loadPhase: input.loadPhase,
    storyRouteInaccessible: input.storyRouteInaccessible,
  });
  return { editorSelection, selectionActions, navigation, onboarding };
}

export function useStoryEditorSelectionModel(input: StoryEditorInteractionStateInput) {
  const { editorSelection, selectionActions, navigation, onboarding } =
    useStoryEditorInteractionState(input);
  return {
    ...editorSelection,
    editorSelection,
    navigation,
    onboarding,
    selectEditorExclusive: editorSelection.selectExclusive,
    selectExclusive: selectionActions.selectExclusive,
    selectInteraction: selectionActions.selectInteraction,
    focusInteraction: selectionActions.focusInteraction,
    closeInspector: selectionActions.closeInspector,
    handleGraphSelectionStart: selectionActions.handleGraphSelectionStart,
  };
}
