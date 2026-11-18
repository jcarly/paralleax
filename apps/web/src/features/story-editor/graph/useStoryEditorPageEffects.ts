import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { useSearchParams } from 'react-router-dom';
import type { StorySettingsTab } from '../../story-settings/StorySettingsDialog';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';

type IdleCallbackWindow = {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleIdleWork(callback: () => void) {
  const idleWindow: IdleCallbackWindow = window;

  if (idleWindow.requestIdleCallback !== undefined) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 2_000 });
    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = window.setTimeout(callback, 0);
  return () => {
    window.clearTimeout(handle);
  };
}

export function useStoryEditorGraphPreparation(
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'],
  storyId: string | undefined,
) {
  useEffect(() => {
    if (loadPhase !== 'ready' || storyId === undefined || storyId.length === 0) {
      return;
    }
    return scheduleIdleWork(() => {
      void Promise.all([
        import('../../../storyGraphCreationLayout'),
        import('../../../storyGraphElkLayout').then(({ preloadStoryGraphElk }) =>
          preloadStoryGraphElk(),
        ),
      ]).catch(() => undefined);
    });
  }, [loadPhase, storyId]);
}

type StoryEditorSettingsCloseInput = {
  setStorySettingsTab: Dispatch<SetStateAction<StorySettingsTab | undefined>>;
  storySettingsTriggerRef: React.RefObject<HTMLButtonElement | null>;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
};

export function useStoryEditorSettingsClose({
  setStorySettingsTab,
  storySettingsTriggerRef,
  searchParams,
  setSearchParams,
}: StoryEditorSettingsCloseInput) {
  return useCallback(() => {
    setStorySettingsTab(undefined);
    window.requestAnimationFrame(() => storySettingsTriggerRef.current?.focus());
    if (!searchParams.has('settings')) {
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('settings');
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, setStorySettingsTab, storySettingsTriggerRef]);
}
