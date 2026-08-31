import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import { safeReturnTo } from './authNavigation';

vi.mock('./api', () => ({
  api: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('./pages/StoryList', () => ({
  StoryList: ({ user }: { user: { id: string } | null }) => (
    <div>{user ? `Stories mock for ${user.id}` : 'Anonymous stories mock'}</div>
  ),
}));
vi.mock('./pages/StoryEditor', () => ({ StoryEditor: () => <div>Editeur mock</div> }));
vi.mock('./pages/StoryPlayer', () => ({ StoryPlayer: () => <div>Lecteur mock</div> }));
vi.mock('./pages/AdminUsersPage', () => ({
  AdminUsersPage: ({ currentUserId }: { currentUserId: string }) => (
    <div>Administration mock for {currentUserId}</div>
  ),
}));
vi.mock('./pages/ParalleaxPrototype', () => ({
  ParalleaxPrototype: () => <div>Prototype mock</div>,
}));

describe('App', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    const user = {
      id: 'user-1',
      email: 'author@example.com',
      role: 'user' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.login).mockResolvedValue(user);
    vi.mocked(api.register).mockResolvedValue(user);
  });

  it('opens every prototype sub-route without checking the real account session', async () => {
    render(
      <MemoryRouter initialEntries={['/prototype/paralleax/design-system']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Prototype mock')).toBeInTheDocument();
    expect(api.me).not.toHaveBeenCalled();
  });

  it('renders the unified accessible-story library as the home page', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Paralleax' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Stories' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Design system' })).not.toBeInTheDocument();
    expect(screen.getByText('Stories mock for user-1')).toBeInTheDocument();
  });

  it('redirects the former authenticated workspace route to the unified library', async () => {
    render(
      <MemoryRouter initialEntries={['/stories']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Stories mock for user-1')).toBeInTheDocument();
  });

  it('exposes user administration only to administrators', async () => {
    vi.mocked(api.me).mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Administration mock for admin-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute(
      'href',
      '/admin/users',
    );

    cleanup();
    vi.mocked(api.me).mockResolvedValue({
      id: 'user-1',
      email: 'member@example.com',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Stories mock for user-1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('does not expose the internal design-system route', async () => {
    render(
      <MemoryRouter initialEntries={['/design-system']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Stories mock for user-1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Design system' })).not.toBeInTheDocument();
  });

  it('routes to editor and player pages', async () => {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Editeur mock')).toBeInTheDocument();

    cleanup();
    render(
      <MemoryRouter initialEntries={['/stories/story-1/play']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Lecteur mock')).toBeInTheDocument();
  });

  it('shows the anonymous story library and authentication actions without a session', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Anonymous stories mock')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2F',
    );
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/register?returnTo=%2F',
    );
  });

  it('opens a public reader route without an active session', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/stories/public-story/play']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Lecteur mock')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fstories%2Fpublic-story%2Fplay',
    );
  });

  it('returns to the protected page after signing in', async () => {
    const user = userEvent.setup();
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit?panel=context']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Sign in to Paralleax' }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email address'), 'author@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Editeur mock')).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith('author@example.com', 'secret-password');
  });

  it('opens registration directly from its public route', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('returns to sign in with a clear notice when the session expires', async () => {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Editeur mock')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('paralleax:session-expired')));

    expect(screen.getByRole('heading', { name: 'Sign in to Paralleax' })).toBeInTheDocument();
    expect(
      screen.getByText('Your session expired. Sign in again to continue.'),
    ).toBeInTheDocument();
  });

  it('rejects external and recursive authentication return destinations', () => {
    expect(safeReturnTo('https://example.com/steal')).toBe('/');
    expect(safeReturnTo('//example.com/steal')).toBe('/');
    expect(safeReturnTo('/login?returnTo=%2Fstories')).toBe('/');
    expect(safeReturnTo('/stories/story-1/play?from=home#current')).toBe(
      '/stories/story-1/play?from=home#current',
    );
  });
});
