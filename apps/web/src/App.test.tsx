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
    updateCurrentUser: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    changePassword: vi.fn(),
    revokeOtherSessions: vi.fn(),
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
      displayName: 'Author',
      role: 'user' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(api.me).mockResolvedValue(user);
    vi.mocked(api.login).mockResolvedValue(user);
    vi.mocked(api.register).mockResolvedValue({ email: user.email, verificationRequired: true });
    vi.mocked(api.updateCurrentUser).mockResolvedValue(user);
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

  it('updates the current display name from the account dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'author@example.com',
      displayName: 'Alice Cooper',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'AU Author: Account settings' }));
    const input = await screen.findByLabelText('Display name');
    await user.clear(input);
    await user.type(input, '  Alice   Cooper  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.updateCurrentUser).toHaveBeenCalledWith('Alice Cooper');
    expect(await screen.findByText('Alice Cooper')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'AL Alice Cooper: Account settings' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('author@example.com')).not.toBeInTheDocument();
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
      displayName: 'Admin',
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
      displayName: 'Member',
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

  it('renders the design-system catalogue by direct route without adding an app navigation link', async () => {
    render(
      <MemoryRouter initialEntries={['/design-system']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'A calm interface for complex stories.' }))
      .toBeInTheDocument();
    expect(document.querySelector('header nav a[href="/design-system"]')).toBeNull();
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

  it('routes Story access links through the editor access settings', async () => {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/access']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Editeur mock')).toBeInTheDocument();
  });

  it('shows the anonymous story library and authentication actions without a session', async () => {
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Anonymous stories mock')).toBeInTheDocument();
    const accountAccess = screen.getByRole('group', { name: 'Account access' });
    expect(accountAccess).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2F',
    );
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/register?returnTo=%2F',
    );
    expect(accountAccess).toContainElement(screen.getByRole('link', { name: 'Sign in' }));
    expect(accountAccess).toContainElement(screen.getByRole('link', { name: 'Create account' }));
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

  it('keeps the protected destination when switching from sign in to registration', async () => {
    const user = userEvent.setup();
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    render(
      <MemoryRouter initialEntries={['/login?returnTo=%2Fstories%2Fstory-1%2Fedit']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Create an account' }));

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toBeInTheDocument();
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

  it('verifies an email from its account action link and returns to the library', async () => {
    const user = userEvent.setup();
    const verifiedUser = {
      id: 'verified-user',
      email: 'verified@example.com',
      displayName: 'Verified Author',
      role: 'user' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const token = '0123456789abcdef0123456789abcdef';
    vi.mocked(api.verifyEmail).mockResolvedValue(verifiedUser);

    render(
      <MemoryRouter initialEntries={[`/verify-email?token=${token}`]}>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Verify and sign in' }));

    expect(api.verifyEmail).toHaveBeenCalledWith(token);
    expect(await screen.findByText('Stories mock for verified-user')).toBeInTheDocument();
  });

  it('resets a password from its account action link and returns to the library', async () => {
    const user = userEvent.setup();
    const resetUser = {
      id: 'reset-user',
      email: 'reset@example.com',
      displayName: 'Reset Author',
      role: 'user' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const token = 'abcdef0123456789abcdef0123456789';
    vi.mocked(api.resetPassword).mockResolvedValue(resetUser);

    render(
      <MemoryRouter initialEntries={[`/reset-password?token=${token}`]}>
        <App />
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText('Password'), 'a-secure-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-secure-password');
    await user.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(api.resetPassword).toHaveBeenCalledWith(token, 'a-secure-password');
    expect(await screen.findByText('Stories mock for reset-user')).toBeInTheDocument();
  });

  it('requests a password reset and returns to sign in', async () => {
    const user = userEvent.setup();
    vi.mocked(api.me).mockRejectedValue(new Error('Unauthorized'));
    vi.mocked(api.requestPasswordReset).mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <App />
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText('Email address'), 'author@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset instructions' }));
    expect(
      await screen.findByText(
        'If an eligible account exists for this email address, reset instructions have been sent.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Sign in to Paralleax' }),
    ).toBeInTheDocument();
  });

  it('signs out and returns to the anonymous library', async () => {
    const user = userEvent.setup();
    vi.mocked(api.logout).mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(api.logout).toHaveBeenCalledOnce();
    expect(await screen.findByText('Anonymous stories mock')).toBeInTheDocument();
  });

  it('returns to sign in with a clear notice when the session expires', async () => {
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Editeur mock')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event('paralleax:session-expired')));

    expect(
      await screen.findByRole('heading', { name: 'Sign in to Paralleax' }),
    ).toBeInTheDocument();
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
