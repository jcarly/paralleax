import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { useTranslation } from 'react-i18next';
import type { GraphDecoration, Interaction, Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import { isRealtimeEditableTarget } from '../../realtime/storyRealtime';
import { interactionLabelForDisplay } from '../../story/interactionTitlePresentation';
import type { useStoryEditorSelection } from '../selection/useStoryEditorSelection';
import type {
  CanvasContextMenuState,
  StoryGraphElementContextTarget,
} from './storyEditorPointerActions';

type GraphElementDeletionOperations = {
  deleteInteraction: (interactionId: string) => Promise<unknown>;
  deleteTrigger: (interactionId: string, triggerId: string) => Promise<unknown>;
  deleteGraphDecoration: (decorationId: string) => Promise<unknown>;
};

function confirmGraphElementDeletion(
  target: StoryGraphElementContextTarget,
  story: Story | undefined,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (target.kind === 'interaction') {
    const interaction = story?.interactions.find(({ id }) => id === target.interactionId);
    if (!interaction) {
      return false;
    }
    return window.confirm(
      t('editor.confirmDeleteInteraction', {
        title: interactionLabelForDisplay(interaction),
      }),
    );
  }
  const message =
    target.kind === 'trigger' ? 'editor.confirmDeleteTrigger' : 'editor.confirmDeleteDecoration';
  return window.confirm(t(message));
}

async function removeGraphElement(
  target: StoryGraphElementContextTarget,
  operations: GraphElementDeletionOperations,
) {
  if (target.kind === 'interaction') {
    await operations.deleteInteraction(target.interactionId);
  } else if (target.kind === 'trigger') {
    await operations.deleteTrigger(target.interactionId, target.triggerId);
  } else {
    await operations.deleteGraphDecoration(target.decorationId);
  }
}

type StoryEditorGraphDeletionInput = {
  story?: Story;
  t: ReturnType<typeof useTranslation>['t'];
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  deleteInteraction: ReturnType<typeof useStoryEditorPersistence>['deleteInteraction'];
  deleteTrigger: ReturnType<typeof useStoryEditorPersistence>['deleteTrigger'];
  deleteGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['deleteGraphDecoration'];
  closeInspector: () => void;
  selected?: Interaction;
};

export function useStoryEditorGraphDeletion(input: StoryEditorGraphDeletionInput) {
  const {
    closeInspector,
    deleteGraphDecoration,
    deleteInteraction,
    deleteTrigger,
    setCanvasContextMenu,
    story,
    t,
    selected,
  } = input;
  const deleteGraphElement = useCallback(
    async (target: StoryGraphElementContextTarget) => {
      setCanvasContextMenu(undefined);
      if (!confirmGraphElementDeletion(target, story, t)) {
        return;
      }
      await removeGraphElement(target, {
        deleteInteraction,
        deleteTrigger,
        deleteGraphDecoration,
      });
      closeInspector();
    },
    [
      closeInspector,
      deleteGraphDecoration,
      deleteInteraction,
      deleteTrigger,
      setCanvasContextMenu,
      story,
      t,
    ],
  );
  const deleteSelectedTrigger = useCallback(
    (interactionId: string, triggerId: string) =>
      deleteGraphElement({ kind: 'trigger', interactionId, triggerId }),
    [deleteGraphElement],
  );
  const remove = useCallback(
    () =>
      selected
        ? deleteGraphElement({ kind: 'interaction', interactionId: selected.id })
        : Promise.resolve(),
    [deleteGraphElement, selected],
  );
  return { deleteGraphElement, deleteSelectedTrigger, remove };
}

export function getSelectedGraphElementTarget(
  selected: Interaction | undefined,
  selectedTriggerTarget: ReturnType<typeof useStoryEditorSelection>['selectedTriggerTarget'],
  selectedGraphDecoration: GraphDecoration | undefined,
): StoryGraphElementContextTarget | undefined {
  if (selected) {
    return { kind: 'interaction', interactionId: selected.id };
  }
  if (selectedTriggerTarget) {
    return {
      kind: 'trigger',
      interactionId: selectedTriggerTarget.interaction.id,
      triggerId: selectedTriggerTarget.trigger.id,
    };
  }
  if (selectedGraphDecoration) {
    return { kind: 'graphDecoration', decorationId: selectedGraphDecoration.id };
  }
  return undefined;
}

type StoryEditorDeleteShortcutInput = {
  deleteGraphElement: (target: StoryGraphElementContextTarget) => Promise<unknown>;
  reviewOnly: boolean;
  selected?: Interaction;
  selectedTriggerTarget: ReturnType<typeof useStoryEditorSelection>['selectedTriggerTarget'];
  selectedGraphDecoration?: GraphDecoration;
};

export function useStoryEditorDeleteShortcut({
  deleteGraphElement,
  reviewOnly,
  selected,
  selectedTriggerTarget,
  selectedGraphDecoration,
}: StoryEditorDeleteShortcutInput) {
  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (
        event.key !== 'Delete' ||
        event.defaultPrevented ||
        event.repeat ||
        reviewOnly ||
        isRealtimeEditableTarget(event.target)
      ) {
        return;
      }
      const target = getSelectedGraphElementTarget(
        selected,
        selectedTriggerTarget,
        selectedGraphDecoration,
      );
      if (target) {
        event.preventDefault();
        void deleteGraphElement(target);
      }
    };
    document.addEventListener('keydown', handleDeleteShortcut);
    return () => {
      document.removeEventListener('keydown', handleDeleteShortcut);
    };
  }, [deleteGraphElement, reviewOnly, selected, selectedGraphDecoration, selectedTriggerTarget]);
}
