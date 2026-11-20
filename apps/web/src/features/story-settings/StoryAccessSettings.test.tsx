import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryAccessConfiguration } from '@paralleax/shared';
import { api } from '../../api';
import { changeInterfaceLanguage, i18n } from '../../i18n';
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
  afterEach(() => {
    cleanup();
  });

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
    ).toEqual(['Everyone', 'By link (unlisted)', 'Signed-in users', 'By invitation', 'Owner only']);
    expect(screen.getByLabelText('Editing')).toHaveValue('owner');
    expect(screen.getByLabelText('Comments')).toHaveValue('editors');
  });

  it('describes the selected value of every access policy', async () => {
    const user = userEvent.setup();
    render(<StoryAccessSettings storyId="story-1" />);
    const reading = await screen.findByLabelText('Reading');
    const editing = screen.getByLabelText('Editing');
    const comments = screen.getByLabelText('Comments');
    const help = (name: string) =>
      screen.getByRole('button', { name: new RegExp(name) }).getAttribute('aria-describedby') ?? '';
    const helpText = (name: string) => document.getElementById(help(name))?.textContent;

    const readingHelp = {
      public: 'Anyone can read the Story without signing in. It appears in the public catalog.',
      unlisted:
        "Anyone with the URL can read the Story without signing in. It won't appear in the public catalog.",
      authenticated: 'Any signed-in user can read the Story and find it in the catalog.',
      invitation: 'Only the users added below can read the Story.',
      private: 'Only you can read the Story. Access given to the users below stays inactive.',
    };
    expect(helpText('Reading')).toBe(readingHelp.private);
    for (const [value, text] of Object.entries(readingHelp)) {
      await user.selectOptions(reading, value);
      await waitFor(() => {
        expect(reading).toHaveValue(value);
      });
      expect(helpText('Reading')).toBe(text);
    }

    expect(helpText('Editing')).toBe('Only you can edit the Story.');
    await user.selectOptions(reading, 'public');
    await user.selectOptions(editing, 'authenticated');
    await waitFor(() => {
      expect(helpText('Editing')).toBe('Any signed-in user can read and edit the Story.');
    });

    expect(helpText('Comments')).toBe('Only users who can edit the Story comment, while editing.');
    await user.selectOptions(comments, 'readers');
    await waitFor(() => {
      expect(helpText('Comments')).toMatch(/^Signed-in users who can read the Story comment/);
    });
  });

  it('only offers editing policies within the reading audience', async () => {
    render(<StoryAccessSettings storyId="story-1" />);
    const editing = await screen.findByLabelText('Editing');
    const option = (name: string) => within(editing).getByRole('option', { name });

    expect(option('Owner only')).toBeEnabled();
    expect(option('Editors')).toBeDisabled();
    expect(option('Signed-in users')).toBeDisabled();
    expect(screen.getByText('Limited by the Reading setting.')).toBeInTheDocument();

    await userEvent.setup().selectOptions(screen.getByLabelText('Reading'), 'invitation');

    await waitFor(() => {
      expect(option('Editors')).toBeEnabled();
    });
    expect(option('Signed-in users')).toBeDisabled();
  });

  it('narrows editing when reading becomes narrower, and says so', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStoryAccess).mockResolvedValue({
      ...structuredClone(access),
      visibility: 'public',
      editPolicy: 'authenticated',
    });
    render(<StoryAccessSettings storyId="story-1" />);

    await user.selectOptions(await screen.findByLabelText('Reading'), 'invitation');

    expect(api.updateStoryAccess).toHaveBeenLastCalledWith('story-1', {
      ...access,
      visibility: 'invitation',
      editPolicy: 'collaborators',
    });
    expect(screen.getByLabelText('Editing')).toHaveValue('collaborators');
    expect(
      await screen.findByText('Editing set to Editors: it cannot be wider than reading.'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Reading'), 'public');
    await waitFor(() => {
      expect(
        screen.queryByText('Editing set to Editors: it cannot be wider than reading.'),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Editing')).toHaveValue('collaborators');
  });

  it('shows an access-loading failure inside the settings surface', async () => {
    vi.mocked(api.getStoryAccess).mockRejectedValue(new Error('Access unavailable'));

    render(<StoryAccessSettings storyId="story-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Access unavailable');
  });

  it('blocks malformed email addresses before sending a collaborator request', async () => {
    const user = userEvent.setup();
    render(<StoryAccessSettings storyId="story-1" />);
    const email = await screen.findByLabelText('User email');

    await user.type(email, 'not-an-email');

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeDisabled();
    expect(api.setStoryCollaborator).not.toHaveBeenCalled();
  });

  it('blocks duplicate collaborator addresses and points to the existing role selector', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStoryAccess).mockResolvedValue({
      ...structuredClone(access),
      collaborators: [
        {
          userId: 'user-2',
          email: 'reader@example.com',
          displayName: 'Reader',
          role: 'viewer',
        },
      ],
    });

    render(<StoryAccessSettings storyId="story-1" />);
    const email = await screen.findByLabelText('User email');

    await user.type(email, 'READER@example.com');

    expect(
      screen.getByText('This user already has access. Change their role below.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add user' })).toBeDisabled();
    expect(screen.getByLabelText('Access for Reader')).toHaveValue('viewer');
    expect(api.setStoryCollaborator).not.toHaveBeenCalled();
  });

  it('localizes a collaborator API error instead of exposing its English server message', async () => {
    await changeInterfaceLanguage('fr');
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

    await user.selectOptions(screen.getByLabelText('Reading'), 'unlisted');
    await user.selectOptions(screen.getByLabelText('Editing'), 'collaborators');
    await user.selectOptions(screen.getByLabelText('Comments'), 'readers');
    await waitFor(() => {
      expect(api.updateStoryAccess).toHaveBeenLastCalledWith(
        'story-1',
        expect.objectContaining({
          visibility: 'unlisted',
          editPolicy: 'collaborators',
          commentPolicy: 'readers',
        }),
      );
    });
    expect(api.updateStoryAccess).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'Save access' })).not.toBeInTheDocument();
    expect(await screen.findByText('Access saved.')).toBeInTheDocument();

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

  it('restores a policy when its automatic save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateStoryAccess).mockRejectedValue(new Error('Access unavailable'));

    render(<StoryAccessSettings storyId="story-1" />);
    const reading = await screen.findByLabelText('Reading');
    await user.selectOptions(reading, 'public');

    expect(await screen.findByRole('alert')).toHaveTextContent('Access unavailable');
    expect(reading).toHaveValue('private');
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

    await act(async () => {
      resolveCurrent(structuredClone(access));
    });
    const reading = await screen.findByLabelText('Reading');
    await user.selectOptions(reading, 'invitation');
    expect(reading).toHaveValue('invitation');

    await act(async () => {
      resolveObsolete(structuredClone(access));
    });
    expect(reading).toHaveValue('invitation');
  });
});
