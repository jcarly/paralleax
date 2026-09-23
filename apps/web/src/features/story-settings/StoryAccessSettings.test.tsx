import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryAccessConfiguration } from '@paralleax/shared';
import { api } from '../../api';
import { i18n } from '../../i18n';
import { StoryAccessSettings } from './StoryAccessSettings';

vi.mock('../../api', () => ({
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
  owner: { id: 'owner-1', email: 'owner@example.com', displayName: 'Owner' },
  collaborators: [],
};

describe('StoryAccessSettings', () => {
  afterEach(() => cleanup());

  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage('en');
    vi.mocked(api.getStoryAccess).mockResolvedValue(structuredClone(access));
    vi.mocked(api.updateStoryAccess).mockImplementation(async (_, settings) => ({
      ...structuredClone(access),
      ...settings,
    }));
    vi.mocked(api.removeStoryCollaborator).mockResolvedValue(undefined);
  });

  it('uses the simplified policy labels and the requested visibility order', async () => {
    render(<StoryAccessSettings storyId="story-1" />);

    const reading = await screen.findByLabelText('Reading');
    expect(
      within(reading)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Everyone', 'Signed-in users', 'By invitation', 'Owner only']);
    expect(screen.getByLabelText('Editing')).toHaveValue('owner');
    expect(screen.getByLabelText('Comments')).toHaveValue('editors');
  });

  it('shows an access-loading failure inside the settings surface', async () => {
    vi.mocked(api.getStoryAccess).mockRejectedValue(new Error('Access unavailable'));

    render(<StoryAccessSettings storyId="story-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Access unavailable');
  });

  it('localizes a collaborator API error instead of exposing its English server message', async () => {
    await i18n.changeLanguage('fr');
    const user = userEvent.setup();
    vi.mocked(api.setStoryCollaborator).mockRejectedValue(
      Object.assign(new Error('The collaborator must be an existing non-owner account'), {
        status: 400,
        code: 'COLLABORATOR_ACCOUNT_INVALID',
      }),
    );

    render(<StoryAccessSettings storyId="story-1" />);
    await screen.findByLabelText('Lecture');
    await user.type(screen.getByLabelText('E-mail de l’utilisateur'), 'missing@example.com');
    await user.click(screen.getByRole('button', { name: 'Ajouter l’utilisateur' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce compte n’existe pas ou est déjà propriétaire de l’histoire.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('The collaborator must');
  });

  it('updates policies, adds a user, changes their access, and removes them', async () => {
    const user = userEvent.setup();
    const viewerAccess: StoryAccessConfiguration = {
      ...structuredClone(access),
      collaborators: [
        {
          userId: 'user-2',
          email: 'reader@example.com',
          displayName: 'Reader',
          role: 'viewer',
        },
      ],
    };
    const editorAccess: StoryAccessConfiguration = {
      ...viewerAccess,
      collaborators: [{ ...viewerAccess.collaborators[0], role: 'editor' }],
    };
    vi.mocked(api.setStoryCollaborator)
      .mockResolvedValueOnce(viewerAccess)
      .mockResolvedValueOnce(editorAccess);

    render(<StoryAccessSettings storyId="story-1" />);
    await screen.findByLabelText('Reading');

    await user.selectOptions(screen.getByLabelText('Reading'), 'public');
    await user.selectOptions(screen.getByLabelText('Editing'), 'collaborators');
    await user.selectOptions(screen.getByLabelText('Comments'), 'readers');
    await user.click(screen.getByRole('button', { name: 'Save access' }));
    expect(api.updateStoryAccess).toHaveBeenCalledWith(
      'story-1',
      expect.objectContaining({
        visibility: 'public',
        editPolicy: 'collaborators',
        commentPolicy: 'readers',
      }),
    );

    await user.type(screen.getByLabelText('User email'), 'reader@example.com');
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    expect(api.setStoryCollaborator).toHaveBeenCalledWith(
      'story-1',
      'reader@example.com',
      'viewer',
    );

    const grant = await screen.findByRole('listitem');
    await user.selectOptions(within(grant).getByLabelText('Access for Reader'), 'editor');
    expect(api.setStoryCollaborator).toHaveBeenLastCalledWith(
      'story-1',
      'reader@example.com',
      'editor',
    );
    expect(within(grant).getByLabelText('Access for Reader')).toHaveValue('editor');

    await user.click(within(grant).getByRole('button', { name: 'Remove' }));
    expect(api.removeStoryCollaborator).toHaveBeenCalledWith('story-1', 'user-2');
    expect(screen.queryByText('reader@example.com')).not.toBeInTheDocument();
  });

  it('ignores an obsolete Strict Mode access response after editing starts', async () => {
    const user = userEvent.setup();
    let resolveObsolete!: (value: StoryAccessConfiguration) => void;
    let resolveCurrent!: (value: StoryAccessConfiguration) => void;
    vi.mocked(api.getStoryAccess)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveObsolete = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCurrent = resolve;
        }),
      );

    render(
      <StrictMode>
        <StoryAccessSettings storyId="story-1" />
      </StrictMode>,
    );

    await act(async () => resolveCurrent(structuredClone(access)));
    const reading = await screen.findByLabelText('Reading');
    await user.selectOptions(reading, 'invitation');
    expect(reading).toHaveValue('invitation');

    await act(async () => resolveObsolete(structuredClone(access)));
    expect(reading).toHaveValue('invitation');
  });
});
