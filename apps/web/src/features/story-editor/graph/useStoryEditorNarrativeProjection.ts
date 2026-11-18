import { useMemo } from 'react';
import type { useTranslation } from 'react-i18next';
import {
  getTriggerConditionGroups,
  type CommentTargetType,
  type Position,
  type Story,
} from '@paralleax/shared';
import { describeTriggerCondition } from '../../../triggerConditionPresentation';
import {
  buildInteractionNodes,
  buildTriggerNodes,
  type SelectedTrigger,
  type StoryFlowNode,
} from '../../../storyGraph';
import { applyStoryGraphSelection, type StoryGraphSelection } from '../../../storyGraphSelection';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { useStoryEditorCommentProjection } from '../../comments/useStoryEditorCommentProjection';
import { buildGraphDecorationNodes } from '../../graph-decorations/graphDecorationNodes';
import type { useOnboarding } from '../../onboarding/onboardingContext';
import { currentOnboardingStep } from '../../onboarding/onboardingProgress';
import { getInitialStoryFitViewOptions } from './storyGraphViewport';
import type { useStoryContextNavigation } from '../navigation/useStoryContextNavigation';
import type { StoryEditorExclusiveSelection } from '../selection/useStoryEditorSelection';

type StoryEditorInteractionNodesInput = {
  story?: Story;
  selectedId?: string;
  selectedTrigger?: SelectedTrigger;
  progress: ReturnType<typeof useOnboarding>['progress'];
  reviewOnly: boolean;
  createChildAndFocus: (interactionId: string, position?: Position) => Promise<void>;
  createParentAndFocus: (interactionId: string, position?: Position) => Promise<void>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  occurrenceCounts: ReturnType<typeof useStoryContextNavigation>['occurrenceCounts'];
  emphasizedInteractionIds: ReturnType<
    typeof useStoryContextNavigation
  >['emphasizedInteractionIds'];
  commentCounts: ReturnType<typeof useStoryEditorCommentProjection>['counts']['graphCommentCounts'];
  onOpenComments: (targetType: CommentTargetType, targetId: string) => void;
};

function buildStoryEditorInteractionNodes(input: StoryEditorInteractionNodesInput) {
  const onboardingBranchSourceId =
    currentOnboardingStep(input.progress) === 'create-branch'
      ? input.story?.interactions.find((interaction) =>
          interaction.triggers.some(({ inputInteractionIds }) => inputInteractionIds.length === 0),
        )?.id
      : undefined;
  return buildInteractionNodes(input.story, input.selectedId, input.selectedTrigger, {
    onCreateChild: input.reviewOnly
      ? undefined
      : (interactionId) => void input.createChildAndFocus(interactionId),
    onCreateParent: input.reviewOnly
      ? undefined
      : (interactionId) => void input.createParentAndFocus(interactionId),
    onSelectRootTrigger: (interactionId, triggerId) => {
      input.selectExclusive({ type: 'trigger', trigger: { interactionId, triggerId } });
    },
    onboardingBranchSourceId,
    occurrenceCounts: input.occurrenceCounts,
    emphasizedInteractionIds: input.emphasizedInteractionIds,
    commentCounts: input.commentCounts,
    onOpenComments: input.onOpenComments,
  });
}

function useStoryEditorInteractionNodes(input: StoryEditorInteractionNodesInput) {
  const {
    commentCounts,
    createChildAndFocus,
    createParentAndFocus,
    emphasizedInteractionIds,
    onOpenComments,
    occurrenceCounts,
    progress,
    reviewOnly,
    selectExclusive,
    selectedId,
    selectedTrigger,
    story,
  } = input;
  return useMemo(
    () =>
      buildStoryEditorInteractionNodes({
        commentCounts,
        createChildAndFocus,
        createParentAndFocus,
        emphasizedInteractionIds,
        onOpenComments,
        occurrenceCounts,
        progress,
        reviewOnly,
        selectExclusive,
        selectedId,
        selectedTrigger,
        story,
      }),
    [
      commentCounts,
      createChildAndFocus,
      createParentAndFocus,
      emphasizedInteractionIds,
      onOpenComments,
      occurrenceCounts,
      progress,
      reviewOnly,
      selectExclusive,
      selectedId,
      selectedTrigger,
      story,
    ],
  );
}

function useStoryEditorDecorationNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  reviewOnly: boolean,
  updateGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['updateGraphDecoration'],
) {
  return useMemo(
    () =>
      buildGraphDecorationNodes(
        story,
        selectedId,
        !reviewOnly,
        (id, patch) => void updateGraphDecoration(id, patch),
      ),
    [reviewOnly, selectedId, story, updateGraphDecoration],
  );
}

type StoryEditorTriggerNodesInput = {
  story?: Story;
  selectedTrigger?: SelectedTrigger;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  commentCounts: ReturnType<typeof useStoryEditorCommentProjection>['counts']['graphCommentCounts'];
  onOpenComments: (targetType: CommentTargetType, targetId: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
};

function buildStoryEditorTriggerNodes(input: StoryEditorTriggerNodesInput) {
  const story = input.story;
  return buildTriggerNodes(story, input.selectedTrigger, {
    onSelectTrigger: (interactionId, triggerId) => {
      input.selectExclusive({ type: 'trigger', trigger: { interactionId, triggerId } });
    },
    conditionSummary: (triggers) => {
      if (!story) {
        return '';
      }
      return triggers
        .flatMap((trigger) =>
          getTriggerConditionGroups(trigger).map(({ conditions }) =>
            conditions.length === 0
              ? input.t('triggerInspector.noConditions')
              : conditions
                  .map((condition) => describeTriggerCondition(story, condition, input.t))
                  .join(` ${input.t('triggerInspector.and')} `),
          ),
        )
        .join(` ${input.t('triggerInspector.or')} `);
    },
    commentCounts: input.commentCounts,
    onOpenComments: input.onOpenComments,
  });
}

function useStoryEditorTriggerNodes(input: StoryEditorTriggerNodesInput) {
  const { commentCounts, onOpenComments, selectExclusive, selectedTrigger, story, t } = input;
  return useMemo(
    () =>
      buildStoryEditorTriggerNodes({
        commentCounts,
        onOpenComments,
        selectExclusive,
        selectedTrigger,
        story,
        t,
      }),
    [commentCounts, onOpenComments, selectExclusive, selectedTrigger, story, t],
  );
}

type StoryEditorNarrativeProjectionInput = {
  story?: Story;
  selectedId?: string;
  selectedTrigger?: SelectedTrigger;
  selectedGraphDecorationId?: string;
  progress: ReturnType<typeof useOnboarding>['progress'];
  reviewOnly: boolean;
  createChildAndFocus: (interactionId: string, position?: Position) => Promise<void>;
  createParentAndFocus: (interactionId: string, position?: Position) => Promise<void>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  occurrenceCounts: ReturnType<typeof useStoryContextNavigation>['occurrenceCounts'];
  emphasizedInteractionIds: ReturnType<
    typeof useStoryContextNavigation
  >['emphasizedInteractionIds'];
  graphCommentCounts: ReturnType<
    typeof useStoryEditorCommentProjection
  >['counts']['graphCommentCounts'];
  openCommentsForTarget: (targetType: CommentTargetType, targetId: string) => void;
  t: ReturnType<typeof useTranslation>['t'];
  graphSelection?: StoryGraphSelection;
  updateGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['updateGraphDecoration'];
};

export function useStoryEditorNarrativeProjection(input: StoryEditorNarrativeProjectionInput) {
  const storyNodes = useStoryEditorInteractionNodes({
    story: input.story,
    selectedId: input.selectedId,
    selectedTrigger: input.selectedTrigger,
    progress: input.progress,
    reviewOnly: input.reviewOnly,
    createChildAndFocus: input.createChildAndFocus,
    createParentAndFocus: input.createParentAndFocus,
    selectExclusive: input.selectExclusive,
    occurrenceCounts: input.occurrenceCounts,
    emphasizedInteractionIds: input.emphasizedInteractionIds,
    commentCounts: input.graphCommentCounts,
    onOpenComments: input.openCommentsForTarget,
  });
  const decorationNodes = useStoryEditorDecorationNodes(
    input.story,
    input.selectedGraphDecorationId,
    input.reviewOnly,
    input.updateGraphDecoration,
  );
  const triggerNodes = useStoryEditorTriggerNodes({
    story: input.story,
    selectedTrigger: input.selectedTrigger,
    selectExclusive: input.selectExclusive,
    commentCounts: input.graphCommentCounts,
    onOpenComments: input.openCommentsForTarget,
    t: input.t,
  });
  const initialFitViewOptions = useMemo(
    () => getInitialStoryFitViewOptions(input.story),
    [input.story],
  );
  const narrativeNodes = useStoryEditorNarrativeNodes(
    storyNodes,
    triggerNodes,
    input.graphSelection,
  );
  return { decorationNodes, initialFitViewOptions, narrativeNodes };
}

function useStoryEditorNarrativeNodes(
  storyNodes: StoryFlowNode[],
  triggerNodes: StoryFlowNode[],
  graphSelection: StoryGraphSelection | undefined,
) {
  return useMemo(
    () => applyStoryGraphSelection([...storyNodes, ...triggerNodes], graphSelection),
    [graphSelection, storyNodes, triggerNodes],
  );
}
