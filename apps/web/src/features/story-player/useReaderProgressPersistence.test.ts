import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderProgressState } from '@paralleax/shared';
import { api } from '../../api';
import { useReaderProgressPersistence } from './useReaderProgressPersistence';

vi.mock('../../api', () => ({
  api: {
    saveReaderProgress: vi.fn(),
    deleteReaderProgress: vi.fn(),
  },
}));

describe('useReaderProgressPersistence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.saveReaderProgress).mockResolvedValue({
      state: sessionFixture(),
      updatedAt: '2026-08-26T08:00:00.000Z',
    });
    vi.mocked(api.deleteReaderProgress).mockResolvedValue(undefined);
  });

  it('saves the authoritative journey and owned item ids', async () => {
    const { result } = renderHook(() =>
      useReaderProgressPersistence({ authenticated: true, storyId: 'story-1' }),
    );

    act(() => result.current.save(sessionFixture()));
    expect(result.current.status).toBe('saving');
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(api.saveReaderProgress).toHaveBeenCalledWith(
      'story-1',
      {
        journeyInteractionIds: ['start'],
        ownedItemIds: ['key-1'],
      },
      'reader',
    );
  });

  it('continues the persistence queue after a failed save', async () => {
    vi.mocked(api.saveReaderProgress).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() =>
      useReaderProgressPersistence({ authenticated: true, storyId: 'story-1' }),
    );

    act(() => {
      result.current.save(sessionFixture());
      result.current.reset();
    });

    await waitFor(() => expect(api.deleteReaderProgress).toHaveBeenCalledWith('story-1', 'reader'));
    await waitFor(() => expect(result.current.status).toBe('idle'));
  });

  it('does not persist an anonymous reader session', () => {
    const { result } = renderHook(() =>
      useReaderProgressPersistence({ authenticated: false, storyId: 'story-1' }),
    );

    act(() => {
      result.current.save(sessionFixture());
      result.current.reset();
    });

    expect(api.saveReaderProgress).not.toHaveBeenCalled();
    expect(api.deleteReaderProgress).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('persists simulation progress in its dedicated autosave', async () => {
    const { result } = renderHook(() =>
      useReaderProgressPersistence({
        authenticated: true,
        storyId: 'story-1',
        mode: 'simulation',
      }),
    );

    act(() => result.current.save(sessionFixture()));

    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(api.saveReaderProgress).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ journeyInteractionIds: ['start'] }),
      'simulation',
    );
  });
});

function sessionFixture(): ReaderProgressState {
  return {
    version: 2,
    journeyInteractionIds: ['start'],
    currentInteractionId: 'start',
    visitedInteractionIds: ['start'],
    currentDateTime: '2000-01-03T08:00',
    currentLocationId: null,
    statValues: {},
    ownedItemIds: ['key-1'],
    itemStatValues: {},
  };
}
