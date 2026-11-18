import type { bindStoryEditorCommentActions } from '../../comments/storyEditorCommentActions';
import type {
  useStoryEditorCommentProjection,
  useStoryEditorCommentSummary,
} from '../../comments/useStoryEditorCommentProjection';
import type { useStoryContextNavigation } from '../navigation/useStoryContextNavigation';
import type { useStoryEditorEntityActions } from '../useStoryEditorEntityActions';
import type { Dispatch, SetStateAction } from 'react';
import type { useTranslation } from 'react-i18next';
import type {
  Character,
  CommentAnchor,
  CommentSemanticSlot,
  CommentTextField,
  ItemDefinition,
  Location,
  Position,
  StatDefinition,
  Story,
  StoryCommentThread,
} from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { useStoryComments } from '../../comments/useStoryComments';
import type { useOnboarding } from '../../onboarding/onboardingContext';
import type {
  useStoryEditorSelection,
  StoryEditorExclusiveSelection,
} from '../selection/useStoryEditorSelection';

type StoryEditorSelectionModel = ReturnType<typeof useStoryEditorSelection>;
type StoryEditorTranslate = ReturnType<typeof useTranslation>['t'];
type StoryGraphElementContextTarget =
  | { kind: 'interaction'; interactionId: string }
  | { kind: 'trigger'; interactionId: string; triggerId: string }
  | { kind: 'graphDecoration'; decorationId: string };

export type StoryEditorInspectorActions = Pick<
  ReturnType<typeof useStoryEditorPersistence>,
  | 'createStatDefinition'
  | 'updateStatDefinition'
  | 'setStory'
  | 'updateGraphDecoration'
  | 'updateLocation'
  | 'moveItemInstance'
  | 'updateCharacter'
  | 'createCharacterStat'
  | 'updateCharacterStat'
  | 'deleteCharacterStat'
  | 'createCharacterItem'
  | 'deleteCharacterItem'
  | 'updateItemDefinition'
  | 'patchInteraction'
  | 'saveTrigger'
> & {
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  closeInspector: () => void;
  toggleContextualComments: () => void;
  startEntityComment: () => void;
  startTextComment: () => void;
  openTextComments: (field: CommentTextField) => void;
  openSemanticComments: (slot: CommentSemanticSlot) => void;
  closeContextualComments: () => void;
  reattachSelectedThread: (threadId: string) => Promise<void>;
  deleteCommentThread: (threadId: string) => Promise<unknown>;
  restoreCommentThread: (threadId: string) => Promise<unknown>;
  focusCommentThread: (threadId: string) => void;
  deleteGraphElement: (target: StoryGraphElementContextTarget) => Promise<void>;
  deleteSelectedTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  remove: () => Promise<void>;
  createEditorGroup: (
    title: string,
    ids: string[],
    parentGroupId?: string,
  ) => Promise<string | false>;
  createChildAndFocus: (interactionId: string, position?: Position) => Promise<void>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  updateLocalStatDefinition: (definition: StatDefinition) => void;
  updateLocalLocation: (location: Location) => void;
  updateLocalCharacter: (patch: Partial<Character>) => void;
  updateLocalItemDefinition: (definition: ItemDefinition) => void;
  reportStepComplete: ReturnType<typeof useOnboarding>['reportStepComplete'];
};

export type StoryEditorInspectorModel = {
  story: Story;
  storyId: string;
  t: StoryEditorTranslate;
  reviewOnly: boolean;
  commentsOpen: boolean;
  hasInspectorSelection: boolean;
  selection: StoryEditorSelectionModel;
  comments: ReturnType<typeof useStoryComments>;
  projectedCommentThreads: StoryCommentThread[];
  selectedTargetThreads: StoryCommentThread[];
  contextualDraftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined;
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  statCategories: string[];
  locationCategories: string[];
  characterCategories: string[];
  itemCategories: string[];
  commentSummary: {
    showContextualComments: boolean;
    selectedTargetCommentCount: number;
    selectedTextCommentCounts: Partial<Record<CommentTextField, number>>;
    selectedSemanticCommentCounts: Partial<Record<string, number>>;
  };
  actions: StoryEditorInspectorActions;
};

type StoryEditorInspectorActionsInput = {
  commentActions: ReturnType<typeof bindStoryEditorCommentActions>;
  entityActions: ReturnType<typeof useStoryEditorEntityActions>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  closeInspector: () => void;
  deleteCommentThread: StoryEditorInspectorActions['deleteCommentThread'];
  restoreCommentThread: StoryEditorInspectorActions['restoreCommentThread'];
  focusCommentThread: StoryEditorInspectorActions['focusCommentThread'];
  deleteGraphElement: StoryEditorInspectorActions['deleteGraphElement'];
  deleteSelectedTrigger: StoryEditorInspectorActions['deleteSelectedTrigger'];
  remove: StoryEditorInspectorActions['remove'];
  createEditorGroup: StoryEditorInspectorActions['createEditorGroup'];
  createChildAndFocus: StoryEditorInspectorActions['createChildAndFocus'];
  updateGraphDecoration: StoryEditorInspectorActions['updateGraphDecoration'];
  selectExclusive: StoryEditorInspectorActions['selectExclusive'];
  reportStepComplete: StoryEditorInspectorActions['reportStepComplete'];
  persistence: ReturnType<typeof useStoryEditorPersistence>;
};

export function buildStoryEditorInspectorActions(
  input: StoryEditorInspectorActionsInput,
): StoryEditorInspectorActions {
  return {
    ...input.commentActions,
    ...input.entityActions,
    setCommentsOpen: input.setCommentsOpen,
    closeInspector: input.closeInspector,
    deleteCommentThread: input.deleteCommentThread,
    restoreCommentThread: input.restoreCommentThread,
    focusCommentThread: input.focusCommentThread,
    deleteGraphElement: input.deleteGraphElement,
    deleteSelectedTrigger: input.deleteSelectedTrigger,
    remove: input.remove,
    createEditorGroup: input.createEditorGroup,
    createChildAndFocus: input.createChildAndFocus,
    updateGraphDecoration: input.updateGraphDecoration,
    selectExclusive: input.selectExclusive,
    reportStepComplete: input.reportStepComplete,
    ...buildStoryEditorPersistenceInspectorActions(input.persistence),
  };
}

function buildStoryEditorPersistenceInspectorActions(
  persistence: ReturnType<typeof useStoryEditorPersistence>,
): Pick<
  StoryEditorInspectorActions,
  | 'createStatDefinition'
  | 'updateStatDefinition'
  | 'setStory'
  | 'updateLocation'
  | 'moveItemInstance'
  | 'updateCharacter'
  | 'createCharacterStat'
  | 'updateCharacterStat'
  | 'deleteCharacterStat'
  | 'createCharacterItem'
  | 'deleteCharacterItem'
  | 'updateItemDefinition'
  | 'patchInteraction'
  | 'saveTrigger'
> {
  return {
    createStatDefinition: persistence.createStatDefinition,
    updateStatDefinition: persistence.updateStatDefinition,
    setStory: persistence.setStory,
    updateLocation: persistence.updateLocation,
    moveItemInstance: persistence.moveItemInstance,
    updateCharacter: persistence.updateCharacter,
    createCharacterStat: persistence.createCharacterStat,
    updateCharacterStat: persistence.updateCharacterStat,
    deleteCharacterStat: persistence.deleteCharacterStat,
    createCharacterItem: persistence.createCharacterItem,
    deleteCharacterItem: persistence.deleteCharacterItem,
    updateItemDefinition: persistence.updateItemDefinition,
    patchInteraction: persistence.patchInteraction,
    saveTrigger: persistence.saveTrigger,
  };
}

type StoryEditorInspectorModelInput = {
  story: Story;
  storyId: string;
  t: StoryEditorTranslate;
  reviewOnly: boolean;
  commentsOpen: boolean;
  hasInspectorSelection: boolean;
  selection: StoryEditorSelectionModel;
  comments: ReturnType<typeof useStoryComments>;
  commentProjection: ReturnType<typeof useStoryEditorCommentProjection>;
  commentSummary: ReturnType<typeof useStoryEditorCommentSummary>;
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  categories: Pick<
    ReturnType<typeof useStoryContextNavigation>,
    'statCategories' | 'locationCategories' | 'characterCategories' | 'itemCategories'
  >;
  actions: StoryEditorInspectorActions;
};

export function buildStoryEditorInspectorModel(
  input: StoryEditorInspectorModelInput,
): StoryEditorInspectorModel {
  return {
    story: input.story,
    storyId: input.storyId,
    t: input.t,
    reviewOnly: input.reviewOnly,
    commentsOpen: input.commentsOpen,
    hasInspectorSelection: input.hasInspectorSelection,
    selection: input.selection,
    comments: input.comments,
    projectedCommentThreads: input.commentProjection.projectedCommentThreads,
    selectedTargetThreads: input.commentProjection.selectedTargetThreads,
    contextualDraftAnchor: input.commentProjection.contextualDraftAnchor,
    canManageCommentThread: input.canManageCommentThread,
    canDeleteCommentThread: input.canDeleteCommentThread,
    statCategories: input.categories.statCategories,
    locationCategories: input.categories.locationCategories,
    characterCategories: input.categories.characterCategories,
    itemCategories: input.categories.itemCategories,
    commentSummary: {
      showContextualComments: input.commentSummary.showContextualComments,
      selectedTargetCommentCount: input.commentSummary.selectedTargetCommentCount,
      selectedTextCommentCounts: input.commentSummary.selectedTextCommentCounts,
      selectedSemanticCommentCounts: input.commentSummary.selectedSemanticCommentCounts,
    },
    actions: input.actions,
  };
}
