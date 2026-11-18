import { useEffect } from 'react';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import { isRealtimeEditableTarget } from '../../realtime/storyRealtime';

type HistoryShortcutAction = 'undo' | 'redo';

function historyShortcutAction(
  event: KeyboardEvent,
  state: {
    saveStatus: string;
    historyBusy: boolean;
    canUndo: boolean;
    canRedo: boolean;
  },
): HistoryShortcutAction | undefined {
  if (!hasHistoryShortcutModifiers(event) || isRealtimeEditableTarget(event.target)) {
    return undefined;
  }
  const action = historyActionForKey(event);
  if (!action || !canRunHistoryAction(action, state)) {
    return undefined;
  }
  return action;
}

function hasHistoryShortcutModifiers(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

function historyActionForKey(event: KeyboardEvent): HistoryShortcutAction | undefined {
  const key = event.key.toLowerCase();
  if (key === 'y' || (key === 'z' && event.shiftKey)) {
    return 'redo';
  }
  return key === 'z' ? 'undo' : undefined;
}

function canRunHistoryAction(
  action: HistoryShortcutAction,
  state: { saveStatus: string; historyBusy: boolean; canUndo: boolean; canRedo: boolean },
) {
  if (state.saveStatus === 'saving' || state.saveStatus === 'error' || state.historyBusy) {
    return false;
  }
  return action === 'undo' ? state.canUndo : state.canRedo;
}

type StoryEditorHistoryShortcutInput = Pick<
  ReturnType<typeof useStoryEditorPersistence>,
  'saveStatus' | 'historyBusy' | 'history' | 'undo' | 'redo'
>;

export function useStoryEditorHistoryShortcuts({
  saveStatus,
  historyBusy,
  history,
  undo,
  redo,
}: StoryEditorHistoryShortcutInput) {
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const action = historyShortcutAction(event, {
        saveStatus,
        historyBusy,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      });
      if (!action) {
        return;
      }
      event.preventDefault();
      void (action === 'undo' ? undo() : redo());
    };
    document.addEventListener('keydown', handleHistoryShortcut);
    return () => {
      document.removeEventListener('keydown', handleHistoryShortcut);
    };
  }, [history.canRedo, history.canUndo, historyBusy, redo, saveStatus, undo]);
}
