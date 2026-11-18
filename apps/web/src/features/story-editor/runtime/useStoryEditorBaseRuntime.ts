import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import { usePendingSaveGuard } from '../../../hooks/usePendingSaveGuard';
import type { StorySettingsTab } from '../../story-settings/StorySettingsDialog';
import type { CanvasContextMenuState } from '../graph/storyEditorPointerActions';
import { useStoryEditorCanvasState } from '../graph/useStoryEditorCanvasState';

export function useStoryEditorPersistenceModel(
  storyId: string,
  setConnectionConflict: Dispatch<SetStateAction<boolean>>,
) {
  const persistence = useStoryEditorPersistence(storyId, setConnectionConflict);
  const pendingSaveGuard = usePendingSaveGuard(
    Boolean(persistence.story) &&
      (persistence.saveStatus === 'saving' || persistence.saveStatus === 'error'),
    'editor',
  );
  return { ...persistence, pendingSaveGuard };
}

export function useStoryEditorLocalUiState(searchParams: URLSearchParams) {
  const [editingGroupId, setEditingGroupId] = useState<string>();
  const creatingGroupRef = useRef(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [contextualCommentsTargetKey, setContextualCommentsTargetKey] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const storySettingsRouteTab: StorySettingsTab | undefined =
    searchParams.get('settings') === 'access' ? 'access' : undefined;
  const [storySettingsTab, setStorySettingsTab] = useState<StorySettingsTab>();
  const openStorySettingsTab = storySettingsRouteTab ?? storySettingsTab;
  const [placingComment, setPlacingComment] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState>();
  return {
    editingGroupId,
    setEditingGroupId,
    creatingGroupRef,
    commentsOpen,
    setCommentsOpen,
    contextualCommentsTargetKey,
    setContextualCommentsTargetKey,
    historyOpen,
    setHistoryOpen,
    storySettingsRouteTab,
    storySettingsTab,
    setStorySettingsTab,
    openStorySettingsTab,
    placingComment,
    setPlacingComment,
    canvasContextMenu,
    setCanvasContextMenu,
  };
}

export function useStoryEditorBaseRuntime() {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const routeLocation = useLocation();
  const [connectionConflict, setConnectionConflict] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const persistence = useStoryEditorPersistenceModel(storyId, setConnectionConflict);
  const storySettingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const uiState = useStoryEditorLocalUiState(searchParams);
  const canvasState = useStoryEditorCanvasState(persistence.story);
  return {
    t,
    storyId,
    routeLocation,
    connectionConflict,
    setConnectionConflict,
    searchParams,
    setSearchParams,
    persistence,
    storySettingsTriggerRef,
    uiState,
    canvasState,
  };
}
