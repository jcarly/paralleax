import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useStoryRealtime,
  type StoryRealtimeInvalidation,
  type StoryRealtimeStatus,
} from './useStoryRealtime';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: Event) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data?: object) {
    const event =
      data === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  close() {
    this.closed = true;
  }
}

function Fixture({
  onInvalidate,
  revision,
}: {
  onInvalidate: (event: StoryRealtimeInvalidation) => void;
  revision?: number;
}) {
  const status: StoryRealtimeStatus = useStoryRealtime('story / 1', true, onInvalidate, revision);
  return <span>{status}</span>;
}

describe('useStoryRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects to the story stream and coalesces change invalidations', () => {
    const onInvalidate = vi.fn();
    render(<Fixture onInvalidate={onInvalidate} />);

    const source = FakeEventSource.instances[0];
    expect(source.url).toBe('/api/stories/story%20%2F%201/events');
    expect(screen.getByText('reconnecting')).toBeInTheDocument();

    act(() => source.onopen?.());
    expect(screen.getByText('live')).toBeInTheDocument();

    act(() => {
      source.emit('ready');
      source.emit('story-changed');
      vi.advanceTimersByTime(75);
    });
    expect(onInvalidate).toHaveBeenCalledOnce();
    expect(onInvalidate).toHaveBeenCalledWith('changed');

    act(() => source.emit('story-deleted'));
    expect(onInvalidate).toHaveBeenLastCalledWith('deleted');
  });

  it('ignores initial readiness and changes already represented by the local revision', () => {
    const onInvalidate = vi.fn();
    const { rerender } = render(<Fixture onInvalidate={onInvalidate} revision={1} />);
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit('ready');
      vi.advanceTimersByTime(75);
    });
    expect(onInvalidate).not.toHaveBeenCalled();

    act(() => source.emit('story-changed', { revision: 2 }));
    rerender(<Fixture onInvalidate={onInvalidate} revision={2} />);
    act(() => vi.advanceTimersByTime(75));
    expect(onInvalidate).not.toHaveBeenCalled();

    act(() => {
      source.emit('story-changed', { revision: 3 });
      vi.advanceTimersByTime(75);
    });
    expect(onInvalidate).toHaveBeenCalledOnce();
    expect(onInvalidate).toHaveBeenCalledWith('changed');
  });
});
