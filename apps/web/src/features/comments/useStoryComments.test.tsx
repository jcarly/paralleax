import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryCommentThread } from '@paralleax/shared';
import { api } from '../../api';
import { useStoryComments } from './useStoryComments';

vi.mock('../../api', () => ({
  api: {
    listCommentThreads: vi.fn(),
    createCommentThread: vi.fn(),
    addCommentMessage: vi.fn(),
    updateCommentThreadStatus: vi.fn(),
    updateCommentThreadAnchor: vi.fn(),
  },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string) {
    const event = new Event(type);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  close() {
    this.closed = true;
  }
}

const thread: StoryCommentThread = {
  id: 'thread-1',
  storyId: 'story-1',
  anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
  anchorLabel: 'Story graph',
  status: 'open',
  createdBy: { id: 'user-1', email: 'reviewer@example.com' },
  createdAt: '2026-08-13T09:00:00.000Z',
  updatedAt: '2026-08-13T09:00:00.000Z',
  messages: [],
};

describe('useStoryComments realtime updates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reloads comments after an SSE change and reconnect signal', async () => {
    const { result, unmount } = renderHook(() => useStoryComments('story-1', true));
    await waitFor(() => expect(api.listCommentThreads).toHaveBeenCalledOnce());
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe('/api/stories/story-1/comment-threads/events');

    act(() => source.onopen?.(new Event('open')));
    expect(result.current.realtimeStatus).toBe('live');

    vi.mocked(api.listCommentThreads).mockResolvedValue([thread]);
    act(() => source.emit('comments-changed'));
    await waitFor(() => expect(result.current.threads).toEqual([thread]));

    act(() => source.onerror?.(new Event('error')));
    expect(result.current.realtimeStatus).toBe('reconnecting');
    unmount();
    expect(source.closed).toBe(true);
  });
});
