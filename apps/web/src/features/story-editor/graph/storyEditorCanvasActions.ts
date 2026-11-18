import type { Dispatch, SetStateAction } from 'react';
import type { CommentTargetType, GraphDecoration, Position, Story } from '@paralleax/shared';
import type { StoryCanvasContextMenu } from '../../../components/StoryCanvasContextMenu';
import type { StoryCanvasToolbar } from '../../../components/StoryCanvasToolbar';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryGraphLayoutTarget } from '../../../storyGraphLayout';
import type {
  CanvasContextMenuState,
  StoryGraphElementContextTarget,
} from './storyEditorPointerActions';
import type { useStoryEditorRelatedCreation } from './useStoryEditorConnectionRuntime';
import type { useStoryGraphOrganization } from './useStoryGraphOrganization';

type StoryEditorCanvasToolbarInput = {
  story: Story;
  reviewOnly: boolean;
  isOrganizing: boolean;
  selectedLayoutTargets: StoryGraphLayoutTarget[];
  placingComment: boolean;
  history: ReturnType<typeof useStoryEditorPersistence>['history'];
  historyBusy: boolean;
  saveStatus: ReturnType<typeof useStoryEditorPersistence>['saveStatus'];
  historyOpen: boolean;
  undo: ReturnType<typeof useStoryEditorPersistence>['undo'];
  redo: ReturnType<typeof useStoryEditorPersistence>['redo'];
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  refreshHistory: ReturnType<typeof useStoryEditorPersistence>['refreshHistory'];
  createRootFromClick: (position?: Position) => Promise<void>;
  addGraphDecoration: (kind: GraphDecoration['kind'], position?: Position) => Promise<void>;
  organizeGraph: ReturnType<typeof useStoryGraphOrganization>;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
};

export function buildStoryEditorCanvasToolbarProps(input: StoryEditorCanvasToolbarInput) {
  return {
    canEdit: !input.reviewOnly,
    canComment: input.story.capabilities?.canComment === true,
    canOrganize: input.story.interactions.length > 0 && !input.isOrganizing,
    organizeSelectionCount: input.selectedLayoutTargets.length,
    placingComment: input.placingComment,
    canUndo: input.history.canUndo,
    canRedo: input.history.canRedo,
    historyBusy: input.historyBusy || input.saveStatus === 'saving' || input.saveStatus === 'error',
    historyOpen: input.historyOpen,
    onUndo: () => void input.undo(),
    onRedo: () => void input.redo(),
    onToggleHistory: () => {
      const open = !input.historyOpen;
      input.setHistoryOpen(open);
      if (open) {
        void input.refreshHistory();
      }
    },
    onCreateRoot: () => void input.createRootFromClick(),
    onAddFrame: () => void input.addGraphDecoration('frame'),
    onAddText: () => void input.addGraphDecoration('text'),
    onOrganize: () => void input.organizeGraph(),
    onToggleCommentPlacement: () => {
      input.setPlacingComment((placing) => !placing);
    },
  } satisfies React.ComponentProps<typeof StoryCanvasToolbar>;
}

type StoryEditorCanvasMenuActionsInput = {
  menu: CanvasContextMenuState;
  createRootFromClick: (position?: Position) => Promise<void>;
  startCanvasComment: (position: Position) => void;
  startEntityCommentForTarget: (targetType: CommentTargetType, targetId: string) => void;
  addGraphDecoration: (kind: GraphDecoration['kind'], position?: Position) => Promise<void>;
  createChildAndFocus: ReturnType<typeof useStoryEditorRelatedCreation>['createChildAndFocus'];
  deleteGraphElement: (target: StoryGraphElementContextTarget) => Promise<unknown>;
  organizeGraph: ReturnType<typeof useStoryGraphOrganization>;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
};

export function buildStoryEditorCanvasMenuActions(input: StoryEditorCanvasMenuActionsInput) {
  const target = input.menu.target;
  return {
    onCreateInteraction: () => void input.createRootFromClick(input.menu.flowPosition),
    onAddComment: () => {
      if (target.kind === 'canvas') {
        input.startCanvasComment(input.menu.flowPosition);
      } else if (target.kind === 'interaction') {
        input.startEntityCommentForTarget('interaction', target.interactionId);
      } else if (target.kind === 'trigger') {
        input.startEntityCommentForTarget('trigger', target.triggerId);
      }
    },
    onAddFrame: () => void input.addGraphDecoration('frame', input.menu.flowPosition),
    onAddText: () => void input.addGraphDecoration('text', input.menu.flowPosition),
    onAddChild: () => {
      if (target.kind === 'interaction') {
        void input.createChildAndFocus(target.interactionId);
      }
    },
    onDelete: () => {
      if (target.kind !== 'canvas') {
        void input.deleteGraphElement(target);
      }
    },
    onOrganizeAll: () => void input.organizeGraph('all'),
    onOrganizeSelection: () => void input.organizeGraph('selection'),
    onOrganizeTarget: () => void input.organizeGraph('selection'),
    onClose: () => {
      input.setCanvasContextMenu(undefined);
    },
  } satisfies StoryEditorCanvasMenuActionProps;
}

export type StoryEditorCanvasMenuActionProps = Omit<
  React.ComponentProps<typeof StoryCanvasContextMenu>,
  'position' | 'targetKind' | 'canEdit' | 'canComment' | 'canOrganize' | 'organizeSelectionCount'
>;
