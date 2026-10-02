import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { AccountDialog } from './AccountDialog';

vi.mock('../api', () => ({
  api: {
    updateCurrentUser: vi.fn(),
    changePassword: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));

describe('AccountDialog', () => {
  const user = {
    id: 'user-1',
    email: 'author@example.com',
    displayName: 'Author',
    role: 'user' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => vi.resetAllMocks());
  afterEach(() => cleanup());

  it('changes the password and allows other sessions to be revoked', async () => {
    const interaction = userEvent.setup();
    const onUpdated = vi.fn();
    vi.mocked(api.changePassword).mockResolvedValue(user);
    vi.mocked(api.revokeOtherSessions).mockResolvedValue(undefined);
    render(<AccountDialog user={user} onClose={vi.fn()} onUpdated={onUpdated} />);

    await interaction.type(screen.getByLabelText('Current password'), 'current password');
    await interaction.type(screen.getByLabelText('New password'), 'new password');
    await interaction.click(screen.getByRole('button', { name: 'Change password' }));

    expect(api.changePassword).toHaveBeenCalledWith('current password', 'new password');
    expect(onUpdated).toHaveBeenCalledWith(user);
    expect(
      screen.getByText('Password changed. Other sessions were signed out.'),
    ).toBeInTheDocument();

    await interaction.click(screen.getByRole('button', { name: 'Sign out other sessions' }));
    expect(api.revokeOtherSessions).toHaveBeenCalledOnce();
  });
});
