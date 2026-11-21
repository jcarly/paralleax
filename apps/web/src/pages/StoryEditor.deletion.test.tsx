import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import {
  api,
  baseStory,
  renderEditor,
  setupStoryEditorTestSuite,
} from '../test/storyEditorTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

setupStoryEditorTestSuite();

it('deletes the selected interaction', async () => {
  const user = userEvent.setup();
  vi.mocked(api.deleteInteraction).mockResolvedValue({
    interactionId: 'interaction-1',
    revision: 2,
    updatedAt: baseStory.updatedAt,
  });

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));
  await user.click(screen.getByRole('button', { name: 'Delete interaction' }));

  expect(api.deleteInteraction).toHaveBeenCalledWith('story-1', 'interaction-1');
  await waitFor(() => {
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  });
});

it('keeps an interaction when deletion is not confirmed', async () => {
  const user = userEvent.setup();
  vi.mocked(window.confirm).mockReturnValueOnce(false);

  await renderEditor();
  await user.click(screen.getByTestId('flow-node-interaction-1'));
  await user.click(screen.getByRole('button', { name: 'Delete interaction' }));

  expect(window.confirm).toHaveBeenCalled();
  expect(api.deleteInteraction).not.toHaveBeenCalled();
  expect(screen.getByTestId('flow-node-interaction-1')).toBeInTheDocument();
});
