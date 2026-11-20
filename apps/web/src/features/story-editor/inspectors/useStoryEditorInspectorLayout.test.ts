import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoryEditorInspectorLayout } from './useStoryEditorInspectorLayout';

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

describe('useStoryEditorInspectorLayout', () => {
  afterEach(() => {
    setViewport(1024);
  });

  it('lets the Inspector grow without a fixed cap, keeping room for the graph', () => {
    setViewport(1600);
    const { result } = renderHook(() => useStoryEditorInspectorLayout(false, vi.fn()));

    // 1600 editor width - 280 graph minimum; the former 720px cap is gone.
    expect(result.current.maximum).toBe(1320);
    act(() => {
      result.current.onResize(900);
    });
    expect(result.current.width).toBe(900);
    expect(result.current.maximized).toBe(false);
  });

  it('maximizes past 70% of the editor and restores the width from before', () => {
    setViewport(1600);
    const preview = vi.fn();
    const { result } = renderHook(() => useStoryEditorInspectorLayout(true, preview));
    act(() => {
      result.current.onResize(500);
    });

    // Editor width 1600 - 260 navigation = 1340; 70% is 938.
    act(() => {
      result.current.onResize(940);
    });

    expect(result.current.maximized).toBe(true);
    expect(result.current.width).toBe(500);
    expect(preview).toHaveBeenLastCalledWith(500);
    act(() => {
      result.current.onToggleMaximized();
    });
    expect(result.current.maximized).toBe(false);
    expect(result.current.width).toBe(500);
  });

  it('does not maximize automatically on narrow screens', () => {
    setViewport(700);
    const { result } = renderHook(() => useStoryEditorInspectorLayout(false, vi.fn()));

    act(() => {
      result.current.onResize(630);
    });

    expect(result.current.maximized).toBe(false);
    expect(result.current.width).toBe(630);
  });
});
