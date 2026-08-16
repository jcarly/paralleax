import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useStoryRealtime,
  type StoryRealtimeInvalidation,
  type StoryRealtimeStatus,
} from './useStoryRealtime';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  close() {
    this.closed = true;
  }
}

function Fixture({ onInvalidate }: { onInvalidate: (event: StoryRealtimeInvalidation) => void }) {
  const status: StoryRealtimeStatus = useStoryRealtime('story / 1', true, onInvalidate);
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
});
