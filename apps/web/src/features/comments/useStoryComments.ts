import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import { api } from '../../api';

export type CommentRealtimeStatus = 'live' | 'reconnecting' | 'unavailable';

export function useStoryComments(storyId: string, enabled: boolean) {
  const [threads, setThreads] = useState<StoryCommentThread[]>([]);
  const [loadedStoryId, setLoadedStoryId] = useState<string>();
  const [error, setError] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draftAnchor, setDraftAnchor] = useState<CommentAnchor>();
  const [liveStoryId, setLiveStoryId] = useState<string>();
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const items = await api.listCommentThreads(storyId);
      if (sequence !== requestSequence.current) return;
      setThreads(items);
      setError('');
    } catch (caught) {
      if (sequence === requestSequence.current) {
        setError(caught instanceof Error ? caught.message : 'Could not load comments');
      }
    } finally {
      if (sequence === requestSequence.current) setLoadedStoryId(storyId);
    }
  }, [storyId]);

  useEffect(() => {
    if (!enabled) return;
    const sequence = ++requestSequence.current;
    api
      .listCommentThreads(storyId)
      .then((items) => {
        if (sequence !== requestSequence.current) return;
        setThreads(items);
        setError('');
      })
      .catch((caught: Error) => {
        if (sequence === requestSequence.current) setError(caught.message);
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoadedStoryId(storyId);
      });
  }, [enabled, storyId]);

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
        setError(caught instanceof Error ? caught.message : 'Could not create comment');
      }
    },
    [draftAnchor, storyId, upsert],
  );

  const reply = useCallback(
    async (threadId: string, body: string) => {
      setError('');
      try {
        return upsert(await api.addCommentMessage(storyId, threadId, body));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not reply');
      }
    },
    [storyId, upsert],
  );

  const setStatus = useCallback(
    async (threadId: string, status: StoryCommentThread['status']) => {
      setError('');
      try {
        return upsert(await api.updateCommentThreadStatus(storyId, threadId, status));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update comment');
      }
    },
    [storyId, upsert],
  );

  const reanchor = useCallback(
    async (threadId: string, anchor: CommentAnchor) => {
      setError('');
      try {
        return upsert(await api.updateCommentThreadAnchor(storyId, threadId, anchor));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not move comment');
      }
    },
    [storyId, upsert],
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
    reload,
    realtimeStatus,
  };
}
