import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import { api } from '../../api';
import { apiErrorMessage } from '../../apiErrorMessages';

export type CommentRealtimeStatus = 'live' | 'reconnecting' | 'unavailable';

export function useStoryComments(storyId: string, enabled: boolean) {
  const { t } = useTranslation();
  const [threads, setThreads] = useState<StoryCommentThread[]>([]);
  const [loadedStoryId, setLoadedStoryId] = useState<string>();
  const [error, setError] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draftAnchor, setDraftAnchor] = useState<CommentAnchor>();
  const [liveStoryId, setLiveStoryId] = useState<string>();
  const [deletedLoadingStoryId, setDeletedLoadingStoryId] = useState<string>();
  const [deletedLoadedStoryId, setDeletedLoadedStoryId] = useState<string>();
  const includeDeleted = useRef(false);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const items = await api.listCommentThreads(storyId, includeDeleted.current);
      if (sequence !== requestSequence.current) return;
      setThreads(items);
      setError('');
    } catch (caught) {
      if (sequence === requestSequence.current) {
        setError(apiErrorMessage(caught, t, t('comments.loadFailed')));
      }
    } finally {
      if (sequence === requestSequence.current) setLoadedStoryId(storyId);
    }
  }, [storyId, t]);

  useEffect(() => {
    if (!enabled) return;
    includeDeleted.current = false;
    const sequence = ++requestSequence.current;
    api
      .listCommentThreads(storyId)
      .then((items) => {
        if (sequence !== requestSequence.current) return;
        setThreads(items);
        setError('');
      })
      .catch((caught: unknown) => {
        if (sequence === requestSequence.current) {
          setError(apiErrorMessage(caught, t, t('comments.loadFailed')));
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoadedStoryId(storyId);
      });
  }, [enabled, storyId, t]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource(
      `/api/stories/${encodeURIComponent(storyId)}/comment-threads/events`,
    );
    const refresh = () => void reload();
    source.addEventListener('ready', refresh);
    source.addEventListener('comments-changed', refresh);
    source.onopen = () => setLiveStoryId(storyId);
    source.onerror = () =>
      setLiveStoryId((connectedStoryId) =>
        connectedStoryId === storyId ? undefined : connectedStoryId,
      );
    return () => source.close();
  }, [enabled, reload, storyId]);

  const loading = enabled && loadedStoryId !== storyId;
  const realtimeStatus: CommentRealtimeStatus =
    typeof EventSource === 'undefined'
      ? 'unavailable'
      : liveStoryId === storyId
        ? 'live'
        : 'reconnecting';

  const selectedThread = useMemo(
    () => threads.find(({ id }) => id === selectedThreadId),
    [selectedThreadId, threads],
  );

  const selectThread = useCallback((threadId: string | undefined) => {
    setSelectedThreadId(threadId);
    if (threadId) setDraftAnchor(undefined);
  }, []);

  const startThread = useCallback((anchor: CommentAnchor) => {
    setDraftAnchor(anchor);
    setSelectedThreadId(undefined);
  }, []);

  const cancelDraft = useCallback(() => setDraftAnchor(undefined), []);

  const upsert = useCallback((thread: StoryCommentThread) => {
    setThreads((items) => {
      const existing = items.some(({ id }) => id === thread.id);
      return existing
        ? items.map((item) => (item.id === thread.id ? thread : item))
        : [thread, ...items];
    });
    setSelectedThreadId(thread.id);
    setDraftAnchor(undefined);
    return thread;
  }, []);

  const create = useCallback(
    async (body: string) => {
      if (!draftAnchor) return;
      setError('');
      try {
        return upsert(await api.createCommentThread(storyId, draftAnchor, body));
      } catch (caught) {
        setError(apiErrorMessage(caught, t, t('comments.createFailed')));
      }
    },
    [draftAnchor, storyId, t, upsert],
  );

  const reply = useCallback(
    async (threadId: string, body: string) => {
      setError('');
      try {
        return upsert(await api.addCommentMessage(storyId, threadId, body));
      } catch (caught) {
        setError(apiErrorMessage(caught, t, t('comments.replyFailed')));
      }
    },
    [storyId, t, upsert],
  );

  const setStatus = useCallback(
    async (threadId: string, status: StoryCommentThread['status']) => {
      setError('');
      try {
        return upsert(await api.updateCommentThreadStatus(storyId, threadId, status));
      } catch (caught) {
        setError(apiErrorMessage(caught, t, t('comments.updateFailed')));
      }
    },
    [storyId, t, upsert],
  );

  const reanchor = useCallback(
    async (threadId: string, anchor: CommentAnchor) => {
      setError('');
      try {
        return upsert(await api.updateCommentThreadAnchor(storyId, threadId, anchor));
      } catch (caught) {
        setError(apiErrorMessage(caught, t, t('comments.moveFailed')));
      }
    },
    [storyId, t, upsert],
  );

  const loadDeleted = useCallback(async () => {
    const deletedLoading = deletedLoadingStoryId === storyId;
    if (deletedLoadedStoryId === storyId || deletedLoading) return;
    includeDeleted.current = true;
    setDeletedLoadingStoryId(storyId);
    const sequence = ++requestSequence.current;
    try {
      const items = await api.listCommentThreads(storyId, true);
      if (sequence !== requestSequence.current) return;
      setThreads(items);
      setDeletedLoadedStoryId(storyId);
      setError('');
    } catch (caught) {
      if (sequence === requestSequence.current) {
        includeDeleted.current = false;
        setError(apiErrorMessage(caught, t, t('comments.loadFailed')));
      }
    } finally {
      if (sequence === requestSequence.current) setDeletedLoadingStoryId(undefined);
    }
  }, [deletedLoadedStoryId, deletedLoadingStoryId, storyId, t]);

  const deleteThread = useCallback(
    async (threadId: string) => {
      setError('');
      try {
        const deleted = upsert(await api.deleteCommentThread(storyId, threadId));
        setSelectedThreadId(undefined);
        return deleted;
      } catch (caught) {
        setError(apiErrorMessage(caught, t, t('comments.deleteFailed')));
      }
    },
    [storyId, t, upsert],
  );

  const restoreThread = useCallback(
    async (threadId: string) => {
      setError('');
      try {
        return upsert(await api.restoreCommentThread(storyId, threadId));
      } catch (caught) {
        setError(apiErrorMessage(caught, t, t('comments.restoreFailed')));
      }
    },
    [storyId, t, upsert],
  );

  return {
    threads,
    loading,
    error,
    selectedThread,
    selectedThreadId,
    selectThread,
    draftAnchor,
    startThread,
    cancelDraft,
    create,
    reply,
    setStatus,
    reanchor,
    deleteThread,
    restoreThread,
    loadDeleted,
    deletedLoading: deletedLoadingStoryId === storyId,
    deletedLoaded: deletedLoadedStoryId === storyId,
    reload,
    realtimeStatus,
  };
}
