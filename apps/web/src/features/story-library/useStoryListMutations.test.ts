import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../api';
import { i18n } from '../../i18n';
import { useStoryDeletion } from './useStoryListMutations';

vi.mock('../../api', () => ({ api: { deleteStory: vi.fn() } }));

afterEach(() => {
  vi.resetAllMocks();
});

function renderDeletion() {
  const setStories = vi.fn();
  const hook = renderHook(() =>
    useStoryDeletion({
      setError: vi.fn(),
      setStories,
      setTotalCount: vi.fn(),
      setRefreshVersion: vi.fn(),
      t: i18n.t.bind(i18n),
    }),
  );
  return { ...hook, setStories };
}

it('reports a deletion started while another runs as busy, never as deleted', async () => {
  let finish: () => void = () => undefined;
  vi.mocked(api.deleteStory).mockReturnValue(
    new Promise<undefined>((resolve) => {
      finish = () => {
        resolve(undefined);
      };
    }),
  );
  const { result, setStories } = renderDeletion();

  let first: Promise<unknown> = Promise.resolve();
  act(() => {
    first = result.current.removeStory('a');
  });
  let second: unknown;
  await act(async () => {
    second = await result.current.removeStory('b');
  });
  expect(second).toEqual({ status: 'busy' });
  expect(api.deleteStory).toHaveBeenCalledTimes(1);
  expect(setStories).not.toHaveBeenCalled();

  finish();
  await act(async () => {
    expect(await first).toEqual({ status: 'deleted' });
  });
});

it('reports an API failure with its message and keeps the list untouched', async () => {
  vi.mocked(api.deleteStory).mockRejectedValue(new Error('boom'));
  const { result, setStories } = renderDeletion();
  let outcome: unknown;
  await act(async () => {
    outcome = await result.current.removeStory('a');
  });
  expect(outcome).toMatchObject({ status: 'failed' });
  expect(setStories).not.toHaveBeenCalled();
});
