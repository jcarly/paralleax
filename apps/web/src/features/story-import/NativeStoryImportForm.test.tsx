import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../../api';
import { StoryImportDialog } from './StoryImportDialog';

vi.mock('../../api', () => ({
  api: { previewNativeStory: vi.fn(), importNativeStory: vi.fn() },
}));

const summary = {
  title: 'Complex Story',
  interactionCount: 3,
  triggerCount: 4,
  characterCount: 1,
  locationCount: 2,
  itemDefinitionCount: 2,
  itemInstanceCount: 3,
  statDefinitionCount: 1,
  statAssignmentCount: 2,
  groupCount: 1,
  graphDecorationCount: 1,
};
const onImportOutcomeUnknown = vi.fn();

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

async function openNativeImport(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={['/library']}>
      <Routes>
        <Route
          path="/library"
          element={
            <StoryImportDialog
              isAdministrator={false}
              onClose={vi.fn()}
              onImported={vi.fn()}
              onImportOutcomeUnknown={onImportOutcomeUnknown}
            />
          }
        />
        <Route path="/stories/:id/edit" element={<h1>Imported editor</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  await user.selectOptions(screen.getByLabelText('Source format'), 'native');
  return screen.getByRole('dialog', { name: 'Import a Paralleax Story' });
}

it('checks a JSON file, shows its summary, then imports and opens the editor', async () => {
  const user = userEvent.setup();
  vi.mocked(api.previewNativeStory).mockResolvedValue(summary);
  vi.mocked(api.importNativeStory).mockResolvedValue({ ...summary, id: 'imported-id' });
  const dialog = await openNativeImport(user);
  const selected = new File(['{}'], 'story.json', { type: 'application/json' });
  await user.upload(within(dialog).getByLabelText('Story JSON file'), selected);
  expect(await within(dialog).findByText('Complex Story')).toBeInTheDocument();
  expect(within(dialog).getByText('Interactions')).toBeInTheDocument();
  expect(within(dialog).getByText('Triggers')).toBeInTheDocument();
  expect(api.importNativeStory).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Import story' }));
  expect(await screen.findByRole('heading', { name: 'Imported editor' })).toBeInTheDocument();
  expect(api.previewNativeStory).toHaveBeenCalledWith(selected, expect.any(AbortSignal));
  expect(api.importNativeStory).toHaveBeenCalledWith(selected, expect.any(AbortSignal));
});

it('shows a localized validation error and permits a different file', async () => {
  const user = userEvent.setup();
  const error = Object.assign(new Error('missing'), {
    status: 400,
    code: 'MISSING_REFERENCE',
    details: { path: '$.story.interactions[0].body' },
  });
  vi.mocked(api.previewNativeStory).mockRejectedValueOnce(error).mockResolvedValueOnce(summary);
  const dialog = await openNativeImport(user);
  const input = within(dialog).getByLabelText('Story JSON file');
  await user.upload(input, new File(['{}'], 'bad.json', { type: 'application/json' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'references an element that does not exist',
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent('$.story.interactions[0].body');
  expect(within(dialog).getByRole('button', { name: 'Import story' })).toBeDisabled();
  await user.upload(input, new File(['{}'], 'good.json', { type: 'application/json' }));
  expect(await within(dialog).findByText('Complex Story')).toBeInTheDocument();
});

it('refreshes the Story library when an import response is lost', async () => {
  const user = userEvent.setup();
  vi.mocked(api.previewNativeStory).mockResolvedValue(summary);
  vi.mocked(api.importNativeStory).mockRejectedValue(
    Object.assign(new Error('The server could not be reached'), {
      status: 0,
      code: 'NETWORK_UNAVAILABLE',
    }),
  );
  const dialog = await openNativeImport(user);
  await user.upload(
    within(dialog).getByLabelText('Story JSON file'),
    new File(['{}'], 'story.json', { type: 'application/json' }),
  );
  await within(dialog).findByText('Complex Story');
  await user.click(within(dialog).getByRole('button', { name: 'Import story' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'The server may have created this Story',
  );
  expect(onImportOutcomeUnknown).toHaveBeenCalledOnce();
});
