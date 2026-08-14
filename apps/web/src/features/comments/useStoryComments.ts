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

  function upsert(thread: StoryCommentThread) {
    setThreads((items) => {
      const existing = items.some(({ id }) => id === thread.id);
      return existing
        ? items.map((item) => (item.id === thread.id ? thread : item))
        : [thread, ...items];
    });
    setSelectedThreadId(thread.id);
    setDraftAnchor(undefined);
    return thread;
  }

  async function create(body: string) {
    if (!draftAnchor) return;
    setError('');
    try {
      return upsert(await api.createCommentThread(storyId, draftAnchor, body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create comment');
    }
  }

  async function reply(threadId: string, body: string) {
    setError('');
    try {
      return upsert(await api.addCommentMessage(storyId, threadId, body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reply');
    }
  }

  async function setStatus(threadId: string, status: StoryCommentThread['status']) {
    setError('');
    try {
      return upsert(await api.updateCommentThreadStatus(storyId, threadId, status));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update comment');
    }
  }

  async function reanchor(threadId: string, anchor: CommentAnchor) {
    setError('');
    try {
      return upsert(await api.updateCommentThreadAnchor(storyId, threadId, anchor));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move comment');
    }
  }

  return {
    threads,
    loading,
    error,
    selectedThread,
    selectedThreadId,
    selectThread: setSelectedThreadId,
    draftAnchor,
    startThread: setDraftAnchor,
    cancelDraft: () => setDraftAnchor(undefined),
    create,
    reply,
    setStatus,
    reanchor,
    reload,
    realtimeStatus,
  };
}
