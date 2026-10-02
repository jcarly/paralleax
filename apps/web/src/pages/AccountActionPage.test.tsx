import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { AccountActionPage } from './AccountActionPage';

vi.mock('../api', () => ({
  api: {
    verifyEmail: vi.fn(),
    resetPassword: vi.fn(),
    requestPasswordReset: vi.fn(),
  },
}));

describe('AccountActionPage', () => {
  const authenticated = {
    id: 'user-1',
    email: 'author@example.com',
    displayName: 'Author',
    role: 'user' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => vi.resetAllMocks());
  afterEach(() => cleanup());

  it('verifies an email token and returns the authenticated account', async () => {
    const user = userEvent.setup();
    const token = 'v'.repeat(43);
    const onAuthenticated = vi.fn();
    vi.mocked(api.verifyEmail).mockResolvedValue(authenticated);
    render(
      <MemoryRouter initialEntries={[`/verify-email?token=${token}`]}>
        <AccountActionPage
          action="verify-email"
          onAuthenticated={onAuthenticated}
          onBackToSignIn={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(api.verifyEmail).toHaveBeenCalledWith(token);
    expect(onAuthenticated).toHaveBeenCalledWith(authenticated);
  });

  it('keeps password-reset requests neutral in the interface', async () => {
    const user = userEvent.setup();
    vi.mocked(api.requestPasswordReset).mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AccountActionPage
          action="request-password-reset"
          onAuthenticated={vi.fn()}
          onBackToSignIn={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Email address'), 'author@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset instructions' }));

    expect(api.requestPasswordReset).toHaveBeenCalledWith('author@example.com');
    expect(
      screen.getByText(/If an eligible account exists for this email address/),
    ).toBeInTheDocument();
  });
});
