import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { AuthPage } from './AuthPage';

vi.mock('../api', () => ({
  api: { login: vi.fn(), register: vi.fn(), resendVerification: vi.fn() },
}));

describe('AuthPage', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.resetAllMocks());

  it('signs in and returns the authenticated user', async () => {
    const user = userEvent.setup();
    const authenticated = {
      id: 'user-1',
      email: 'author@example.com',
      displayName: 'Author',
      role: 'user' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(api.login).mockResolvedValue(authenticated);
    const onAuthenticated = vi.fn();
    render(<AuthPage onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Email address'), 'author@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.login).toHaveBeenCalledWith('author@example.com', 'correct horse battery staple');
    expect(onAuthenticated).toHaveBeenCalledWith(authenticated);
  });

  it('shows an error when the authenticated transition fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockResolvedValue({
      id: 'user-1',
      email: 'author@example.com',
      displayName: 'Author',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const onAuthenticated = vi.fn().mockRejectedValue(new Error('Navigation failed'));
    render(<AuthPage onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Email address'), 'author@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Navigation failed');
  });

  it('switches to account creation', async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('registers only after both passwords match', async () => {
    const user = userEvent.setup();
    vi.mocked(api.register).mockResolvedValue({
      email: 'new@example.com',
      verificationRequired: true,
    });
    const onAuthenticated = vi.fn();
    render(<AuthPage initialMode="register" onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Display name'), 'New Author');
    await user.type(screen.getByLabelText('Email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm password'), 'different password');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();

    const confirmation = screen.getByLabelText('Confirm password');
    await user.clear(confirmation);
    await user.type(confirmation, 'correct horse battery staple');
    expect(screen.queryByLabelText(/Invitation code/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(api.register).toHaveBeenCalledWith(
      'new@example.com',
      'correct horse battery staple',
      'New Author',
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/new@example.com/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(api.resendVerification).toHaveBeenCalledWith('new@example.com');
  });

  it('signs in immediately when registration returns a local session', async () => {
    const user = userEvent.setup();
    const authenticated = {
      id: 'user-1',
      email: 'new@example.com',
      displayName: 'New Author',
      role: 'user' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(api.register).mockResolvedValue({
      verificationRequired: false,
      user: authenticated,
    });
    const onAuthenticated = vi.fn();
    render(<AuthPage initialMode="register" onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Display name'), 'New Author');
    await user.type(screen.getByLabelText('Email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onAuthenticated).toHaveBeenCalledWith(authenticated);
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it('shows a session notice', () => {
    render(<AuthPage notice="Your session expired." onAuthenticated={vi.fn()} />);
    expect(screen.getByText('Your session expired.')).toBeInTheDocument();
  });
});

describe('AuthPage navigation callback errors', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.resetAllMocks());

  it('shows an error when switching authentication modes fails', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn().mockRejectedValue(new Error('Mode change failed'));
    render(<AuthPage onAuthenticated={vi.fn()} onModeChange={onModeChange} />);

    await user.click(screen.getByRole('button', { name: 'Create an account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mode change failed');
  });

  it('keeps sign-in pending until its parent transition finishes', async () => {
    const user = userEvent.setup();
    let resolveTransition: (() => void) | undefined;
    const transition = new Promise<void>((resolve) => {
      resolveTransition = resolve;
    });
    vi.mocked(api.login).mockResolvedValue({
      id: 'user-1',
      email: 'author@example.com',
      displayName: 'Author',
      role: 'user',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const onAuthenticated = vi.fn(() => transition);
    render(<AuthPage onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Email address'), 'author@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());

    const submit = screen.getByRole('button', { name: 'Please wait…' });
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(api.login).toHaveBeenCalledOnce();

    resolveTransition?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  });
});
