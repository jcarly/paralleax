import { useCallback, useRef, useState, type FormEvent } from 'react';
import { type Story, type StorySummary } from '@paralleax/shared';
import type { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { api, type AuthUser } from '../../api';

type PendingAction = 'story' | 'demo' | '';

async function describeApiError(caught: unknown, t: TFunction, fallback: string) {
  const { apiErrorMessage } = await import('../../apiErrorMessages');
  return apiErrorMessage(caught, t, fallback);
}

function summarizeStory(story: Story, user: AuthUser | null): StorySummary {
  return {
    id: story.id,
    revision: story.revision,
    title: story.title,
    interactionCount: story.interactions.length,
    startDateTime: story.startDateTime,
    access: story.access,
    capabilities: story.capabilities ?? {
      canRead: true,
      canEdit: true,
      canManage: true,
      canComment: true,
    },
    owner:
      story.owner ?? (user === null ? undefined : { id: user.id, displayName: user.displayName }),
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
}

export function useStoryListPending() {
  return useState<PendingAction>('');
}

export function useStoryCreation({
  pending,
  setPending,
  setError,
  closeDialog,
  onStoryCreated,
  t,
}: {
  pending: PendingAction;
  setPending: (pending: PendingAction) => void;
  setError: (error: string) => void;
  closeDialog: () => void;
  onStoryCreated?: (storyId: string) => void;
  t: TFunction;
}) {
  const navigate = useNavigate();
  const [newTitle, setNewTitle] = useState('');
  const createStory = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const title = newTitle.trim();
      if (!title || pending !== '') {
        return;
      }
      try {
        setError('');
        setPending('story');
        const story = await api.createStory(title);
        onStoryCreated?.(story.id);
        setNewTitle('');
        closeDialog();
        const firstInteraction =
          story.interactions.find(({ triggers }) =>
            triggers.some(({ inputInteractionIds }) => inputInteractionIds.length === 0),
          ) ?? story.interactions[0];
        const focusQuery =
          story.interactions.length === 0
            ? ''
            : `?focusInteractionId=${encodeURIComponent(firstInteraction.id)}`;
        void navigate(`/stories/${story.id}/edit${focusQuery}`);
      } catch (caught) {
        setError(await describeApiError(caught, t, t('library.createFailed')));
      } finally {
        setPending('');
      }
    },
    [closeDialog, navigate, newTitle, onStoryCreated, pending, setError, setPending, t],
  );

  return { newTitle, setNewTitle, createStory };
}

export function useDemoStoryCreation({
  pending,
  setPending,
  setError,
  setStories,
  setTotalCount,
  resetLibraryView,
  user,
  t,
}: {
  pending: PendingAction;
  setPending: (pending: PendingAction) => void;
  setError: (error: string) => void;
  setStories: (update: (stories: StorySummary[]) => StorySummary[]) => void;
  setTotalCount: (update: (count: number) => number) => void;
  resetLibraryView: () => void;
  user: AuthUser | null;
  t: TFunction;
}) {
  return useCallback(async () => {
    if (pending !== '') {
      return;
    }
    try {
      setError('');
      setPending('demo');
      const demos = await api.createDemoStories();
      setStories((items) => [...demos.map((story) => summarizeStory(story, user)), ...items]);
      setTotalCount((count) => count + demos.length);
      resetLibraryView();
    } catch (caught) {
      setError(await describeApiError(caught, t, t('library.demoFailed')));
    } finally {
      setPending('');
    }
  }, [pending, resetLibraryView, setError, setPending, setStories, setTotalCount, t, user]);
}

export type StoryDeletionResult =
  { status: 'deleted' } | { status: 'busy' } | { status: 'failed'; message: string };

export function useStoryDeletion({
  setError,
  setStories,
  setTotalCount,
  setRefreshVersion,
  onStoryDeleted,
  t,
}: {
  setError: (error: string) => void;
  setStories: (update: (stories: StorySummary[]) => StorySummary[]) => void;
  setTotalCount: (update: (count: number) => number) => void;
  setRefreshVersion: (update: (version: number) => number) => void;
  onStoryDeleted?: (storyId: string) => void;
  t: TFunction;
}) {
  const deletingStoryRef = useRef(false);
  const [deletingStoryId, setDeletingStoryId] = useState('');
  const removeStory = useCallback(
    async (id: string): Promise<StoryDeletionResult> => {
      if (deletingStoryRef.current) {
        return { status: 'busy' };
      }
      deletingStoryRef.current = true;
      setDeletingStoryId(id);
      try {
        setError('');
        await api.deleteStory(id);
        onStoryDeleted?.(id);
        setStories((items) => items.filter((item) => item.id !== id));
        setTotalCount((count) => Math.max(0, count - 1));
        setRefreshVersion((version) => version + 1);
        return { status: 'deleted' };
      } catch (caught) {
        return {
          status: 'failed',
          message: await describeApiError(caught, t, t('library.deleteFailed')),
        };
      } finally {
        deletingStoryRef.current = false;
        setDeletingStoryId('');
      }
    },
    [onStoryDeleted, setError, setRefreshVersion, setStories, setTotalCount, t],
  );

  return { deletingStoryId, removeStory };
}

export function useStoryImportHandler({
  user,
  setStories,
  setTotalCount,
  resetLibraryView,
}: {
  user: AuthUser | null;
  setStories: (update: (stories: StorySummary[]) => StorySummary[]) => void;
  setTotalCount: (update: (count: number) => number) => void;
  resetLibraryView: () => void;
}) {
  return useCallback(
    (story: StorySummary) => {
      const owner =
        story.owner ?? (user === null ? undefined : { id: user.id, displayName: user.displayName });
      setStories((items) => [{ ...story, owner }, ...items]);
      setTotalCount((count) => count + 1);
      resetLibraryView();
    },
    [resetLibraryView, setStories, setTotalCount, user],
  );
}
