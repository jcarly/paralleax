import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSimulationMutationPersistence } from './useSimulationMutationPersistence';

describe('useSimulationMutationPersistence', () => {
  it('reports a successful authored mutation', async () => {
    const applyResult = vi.fn();
    const { result } = renderHook(() =>
      useSimulationMutationPersistence({ storyId: 'story-1', fallbackError: 'Save failed' }),
    );

    await act(() => result.current.run(async () => 'saved', applyResult));

    expect(applyResult).toHaveBeenCalledWith('saved');
    expect(result.current).toMatchObject({ status: 'saved', error: '', canRetry: false });
  });

  it('keeps a failed safe mutation retryable', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce('saved');
    const applyResult = vi.fn();
    const { result } = renderHook(() =>
      useSimulationMutationPersistence({ storyId: 'story-1', fallbackError: 'Save failed' }),
    );

    await act(() => result.current.run(operation, applyResult));
    expect(result.current).toMatchObject({
      status: 'error',
      error: 'Connection lost',
      canRetry: true,
    });

    act(() => result.current.retry());
    expect(result.current.status).toBe('saving');
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(operation).toHaveBeenCalledTimes(2);
    expect(applyResult).toHaveBeenCalledWith('saved');
  });

  it('does not offer an unsafe creation mutation for automatic retry', async () => {
    const { result } = renderHook(() =>
      useSimulationMutationPersistence({ storyId: 'story-1', fallbackError: 'Save failed' }),
    );

    await act(() =>
      result.current.run(
        async () => Promise.reject(new Error('Unknown creation outcome')),
        vi.fn(),
        { retryable: false },
      ),
    );

    expect(result.current).toMatchObject({ status: 'error', canRetry: false });
  });
});
