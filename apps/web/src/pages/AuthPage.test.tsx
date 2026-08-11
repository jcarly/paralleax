import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { AuthPage } from './AuthPage';

vi.mock('../api', () => ({
  api: { login: vi.fn(), register: vi.fn() },
}));

describe('AuthPage', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.resetAllMocks());

  it('signs in and returns the authenticated user', async () => {
    const user = userEvent.setup();
    const authenticated = {
      id: 'user-1',
      email: 'author@example.com',
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

  it('switches to account creation', async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthenticated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('registers only after both passwords match', async () => {
    const user = userEvent.setup();
    const authenticated = {
      id: 'user-2',
      email: 'new@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(api.register).mockResolvedValue(authenticated);
    const onAuthenticated = vi.fn();
    render(<AuthPage initialMode="register" onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('Email address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.type(screen.getByLabelText('Confirm password'), 'different password');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();

    await user.clear(screen.getByPlaceholderText('Repeat your password'));
    await user.type(
      screen.getByPlaceholderText('Repeat your password'),
      'correct horse battery staple',
    );
    await user.type(screen.getByLabelText('Invitation code (if required)'), 'correct-alpha-code');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(api.register).toHaveBeenCalledWith(
      'new@example.com',
      'correct horse battery staple',
      'correct-alpha-code',
    );
    expect(onAuthenticated).toHaveBeenCalledWith(authenticated);
  });

  it('shows a session notice', () => {
    render(<AuthPage notice="Your session expired." onAuthenticated={vi.fn()} />);
    expect(screen.getByText('Your session expired.')).toBeInTheDocument();
  });
});
