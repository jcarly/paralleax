import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { useTranslation } from 'react-i18next';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryGraphSelection } from '../../../storyGraphSelection';
import { isRealtimeEditableTarget } from '../../realtime/storyRealtime';
import type { useStoryContextNavigation } from '../navigation/useStoryContextNavigation';
import type { StoryEditorExclusiveSelection } from '../selection/useStoryEditorSelection';

function isGroupShortcut(event: KeyboardEvent, reviewOnly: boolean) {
  return (
    !reviewOnly &&
    !isRealtimeEditableTarget(event.target) &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'g'
  );
}

type StoryEditorGroupActionsInput = {
  createGroup: ReturnType<typeof useStoryEditorPersistence>['createGroup'];
  creatingGroupRef: React.MutableRefObject<boolean>;
  clearSearch: () => void;
  openContextPanel: () => void;
  openContextSection: ReturnType<typeof useStoryContextNavigation>['openContextSection'];
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  setEditingGroupId: Dispatch<SetStateAction<string | undefined>>;
};

type StoryEditorGroupShortcutInput = {
  graphSelection?: StoryGraphSelection;
  reviewOnly: boolean;
  selectedId?: string;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  t: ReturnType<typeof useTranslation>['t'];
  createEditorGroup: (
    title: string,
    ids: string[],
    parentGroupId?: string,
  ) => Promise<string | false>;
};

export function useStoryEditorGroupShortcut({
  createEditorGroup,
  graphSelection,
  reviewOnly,
  selectedId,
  setCommentsOpen,
  t,
}: StoryEditorGroupShortcutInput) {
  useEffect(() => {
    function handleGroupShortcut(event: KeyboardEvent) {
      if (!isGroupShortcut(event, reviewOnly)) {
        return;
      }
      const ids =
        graphSelection?.interactionIds ??
        (selectedId !== undefined && selectedId.length > 0 ? [selectedId] : []);
      if (!ids.length) {
        return;
      }
      event.preventDefault();
      setCommentsOpen(false);
      void createEditorGroup(t('editor.groups.newGroup'), ids);
    }
    document.addEventListener('keydown', handleGroupShortcut);
    return () => {
      document.removeEventListener('keydown', handleGroupShortcut);
    };
  }, [createEditorGroup, graphSelection, reviewOnly, selectedId, setCommentsOpen, t]);
}

export function useStoryEditorGroupActions(input: StoryEditorGroupActionsInput) {
  const {
    clearSearch,
    createGroup,
    creatingGroupRef,
    openContextPanel,
    openContextSection,
    selectExclusive,
    setCommentsOpen,
    setEditingGroupId,
  } = input;
  const createEditorGroup = useCallback(
    async (title: string, ids: string[], parentGroupId?: string) => {
      if (creatingGroupRef.current) {
        return false;
      }
      creatingGroupRef.current = true;
      try {
        const id = await createGroup(title, ids, parentGroupId);
        if (typeof id === 'string' && id.length > 0) {
          clearSearch();
          openContextPanel();
          openContextSection('groups');
          setCommentsOpen(false);
          selectExclusive({ type: 'group', id });
          setEditingGroupId(id);
        }
        return typeof id === 'string' ? id : false;
      } finally {
        creatingGroupRef.current = false;
      }
    },
    [
      clearSearch,
      createGroup,
      creatingGroupRef,
      openContextPanel,
      openContextSection,
      selectExclusive,
      setCommentsOpen,
      setEditingGroupId,
    ],
  );
  return createEditorGroup;
}
