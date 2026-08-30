import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  diffStoryGraphPositions,
  updateStoryGraphPositions,
  type StoryHistory,
} from '@paralleax/shared';
import { computeStoryGraphLayout } from '../storyGraphLayout';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

import {
  api,
  baseStory,
  cloneStory,
  renderEditor,
  setupStoryEditorTestSuite,
  storyWithTwoInteractions,
} from '../test/storyEditorTestHarness';

setupStoryEditorTestSuite();

const undoableHistory: StoryHistory = {
  entries: [
    {
      id: '1',
      revision: 2,
      kind: 'change',
      operation: 'story.updated',
      actor: { id: 'user-1' },
      createdAt: '2026-08-28T08:01:00.000Z',
      reverted: false,
    },
  ],
  canUndo: true,
  canRedo: false,
};

describe('Story editor history', () => {
  beforeEach(() => {
    vi.mocked(api.getStoryHistory).mockResolvedValue(undoableHistory);
  });

  it('replaces the editor Story from the persistent undo result', async () => {
    const user = userEvent.setup();
    const changed = { ...cloneStory(), revision: 2, title: 'Changed title' };
    const restored = { ...cloneStory(), revision: 3 };
    vi.mocked(api.undoStoryChange).mockResolvedValue({
      story: restored,
      history: { ...undoableHistory, canUndo: false, canRedo: true },
    });

    await renderEditor(changed);
    const undo = await screen.findByRole('button', { name: 'Undo last Story change' });
    await waitFor(() => expect(undo).toBeEnabled());
    await user.click(undo);

    expect(api.undoStoryChange).toHaveBeenCalledWith('story-1');
    await waitFor(() => expect(screen.getByDisplayValue('Test story')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Redo Story change' })).toBeEnabled();
  });

  it('supports Ctrl+Z and Ctrl+Shift+Z outside editable controls', async () => {
    const user = userEvent.setup();
    const undoneHistory = { ...undoableHistory, canUndo: false, canRedo: true };
    vi.mocked(api.undoStoryChange).mockResolvedValue({
      story: { ...cloneStory(), revision: 3 },
      history: undoneHistory,
    });
    vi.mocked(api.redoStoryChange).mockResolvedValue({
      story: { ...cloneStory(), revision: 4, title: 'Changed again' },
      history: undoableHistory,
    });

    await renderEditor({ ...cloneStory(), revision: 2, title: 'Changed title' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo last Story change' })).toBeEnabled(),
    );
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(api.undoStoryChange).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Redo Story change' })).toBeEnabled(),
    );
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(api.redoStoryChange).toHaveBeenCalledTimes(1));
  });

  it('leaves Ctrl+Z inside a text field to the native editor history', async () => {
    const user = userEvent.setup();
    await renderEditor({ ...baseStory, revision: 2 });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo last Story change' })).toBeEnabled(),
    );

    await user.click(screen.getByDisplayValue('Test story'));
    await user.keyboard('{Control>}z{/Control}');

    expect(api.undoStoryChange).not.toHaveBeenCalled();
  });

  it('enables undo after a local save without reloading history for the new revision', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStoryHistory).mockResolvedValue({
      entries: [],
      canUndo: false,
      canRedo: false,
    });
    vi.mocked(api.renameStory).mockResolvedValue({
      ...cloneStory(),
      revision: 2,
      title: 'Renamed story',
    });

    await renderEditor(cloneStory());
    await waitFor(() => expect(api.getStoryHistory).toHaveBeenCalledOnce());
    const title = screen.getByDisplayValue('Test story');
    await user.clear(title);
    await user.type(title, 'Renamed story');
    await user.tab();

    await waitFor(() => expect(api.renameStory).toHaveBeenCalledWith('story-1', 'Renamed story'));
    expect(api.getStoryHistory).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Undo last Story change' })).toBeEnabled();
  });

  it('restores locally saved graph positions before the durable undo responds', async () => {
    const user = userEvent.setup();
    const original = { ...storyWithTwoInteractions(), revision: 1 };
    const layout = computeStoryGraphLayout(original, { kind: 'all' });
    const positioned = updateStoryGraphPositions(original, layout);
    const undoPatch = diffStoryGraphPositions(positioned, original);
    vi.mocked(api.updateStoryGraphPositions).mockResolvedValue({
      revision: 2,
      updatedAt: '2026-08-30T08:01:00.000Z',
    });
    let resolveUndo:
      ((result: Awaited<ReturnType<typeof api.undoStoryChange>>) => void) | undefined;
    const pendingUndo = new Promise<Awaited<ReturnType<typeof api.undoStoryChange>>>((resolve) => {
      resolveUndo = resolve;
    });
    vi.mocked(api.undoStoryChange).mockReturnValue(pendingUndo);

    await renderEditor(original);
    await user.click(screen.getByRole('button', { name: 'Organize graph' }));
    await waitFor(() => expect(api.updateStoryGraphPositions).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId('flow-node-interaction-2')).toHaveAttribute(
        'data-node-y',
        String(positioned.interactions[1].position.y),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Undo last Story change' }));

    expect(api.undoStoryChange).toHaveBeenCalledWith('story-1');
    await waitFor(() =>
      expect(screen.getByTestId('flow-node-interaction-2')).toHaveAttribute(
        'data-node-y',
        String(original.interactions[1].position.y),
      ),
    );

    await act(async () => {
      resolveUndo?.({
        storyId: 'story-1',
        revision: 3,
        updatedAt: '2026-08-30T08:02:00.000Z',
        graphPositions: undoPatch,
        history: { ...undoableHistory, canUndo: false, canRedo: true },
      });
      await pendingUndo;
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Redo Story change' })).toBeEnabled(),
    );
  });
});
