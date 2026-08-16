import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryAccessConfiguration } from '@paralleax/shared';
import { api } from '../api';
import { i18n } from '../i18n';
import { StoryAccessPage } from './StoryAccessPage';

vi.mock('../api', () => ({
  api: {
    getStoryAccess: vi.fn(),
    updateStoryAccess: vi.fn(),
    setStoryCollaborator: vi.fn(),
    removeStoryCollaborator: vi.fn(),
  },
}));

const access: StoryAccessConfiguration = {
  visibility: 'private',
  editPolicy: 'owner',
  commentPolicy: 'editors',
  owner: { id: 'owner-1', email: 'owner@example.com' },
  collaborators: [],
};

describe('StoryAccessPage', () => {
  afterEach(() => cleanup());
  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage('en');
    vi.mocked(api.getStoryAccess).mockResolvedValue(structuredClone(access));
    vi.mocked(api.updateStoryAccess).mockImplementation(async (_, settings) => ({
      ...structuredClone(access),
      ...settings,
    }));
    vi.mocked(api.setStoryCollaborator).mockResolvedValue({
      ...structuredClone(access),
      collaborators: [{ userId: 'user-2', email: 'reader@example.com', role: 'viewer' }],
    });
  });

  function renderPage() {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/access']}>
        <Routes>
          <Route path="/stories/:storyId/access" element={<StoryAccessPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('updates policies and adds an existing account invitation', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Access and permissions' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Who may comment?')).toHaveValue('editors');
    expect(screen.getByRole('option', { name: 'Editors only' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Any signed-in reader' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Comments disabled' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Any signed-in user who can read' }),
    ).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Who can read this story?'), 'public');
    await user.selectOptions(screen.getByLabelText('Who may comment?'), 'readers');
    await user.click(screen.getByRole('button', { name: 'Save access' }));
    expect(api.updateStoryAccess).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({ visibility: 'public', commentPolicy: 'readers' }),
    );

    await user.type(screen.getByLabelText('Account email'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Add invitation' }));
    expect(api.setStoryCollaborator).toHaveBeenCalledWith(
      'story-1',
      'reader@example.com',
      'viewer',
    );
    expect(await screen.findByText('reader@example.com')).toBeInTheDocument();
  });
});
