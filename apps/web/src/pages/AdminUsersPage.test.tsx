import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { i18n } from '../i18n';
import { AdminUsersPage } from './AdminUsersPage';

vi.mock('../api', () => ({ api: { listUsers: vi.fn(), updateUserRole: vi.fn() } }));

describe('AdminUsersPage', () => {
  afterEach(() => cleanup());
  beforeEach(async () => {
    vi.resetAllMocks();
    await i18n.changeLanguage('en');
    vi.mocked(api.listUsers).mockResolvedValue([
      {
        id: 'user-1',
        email: 'member@example.com',
        role: 'user',
        createdAt: '2026-08-13T00:00:00Z',
      },
    ]);
    vi.mocked(api.updateUserRole).mockResolvedValue({
      id: 'user-1',
      email: 'member@example.com',
      role: 'admin',
      createdAt: '2026-08-13T00:00:00Z',
    });
  });

  it('promotes an account to administrator', async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);
    const selector = await screen.findByRole('combobox', { name: 'Role for member@example.com' });
    await user.selectOptions(selector, 'admin');
    expect(api.updateUserRole).toHaveBeenCalledWith('user-1', 'admin');
    expect(await screen.findByText('member@example.com is now Administrator.')).toBeInTheDocument();
  });

  it('summarizes, searches, and filters accounts', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listUsers).mockResolvedValue([
      {
        id: 'admin-1',
        email: 'owner@example.com',
        role: 'admin',
        createdAt: '2026-08-12T00:00:00Z',
      },
      {
        id: 'user-1',
        email: 'member@example.com',
        role: 'user',
        createdAt: '2026-08-13T00:00:00Z',
      },
      {
        id: 'user-2',
        email: 'second@example.com',
        role: 'user',
        createdAt: '2026-08-13T00:00:00Z',
      },
    ]);

    render(<AdminUsersPage currentUserId="admin-1" />);

    const overview = await screen.findByRole('region', { name: 'Account overview' });
    expect(within(overview).getByText('3')).toBeInTheDocument();
    expect(within(overview).getByText('1')).toBeInTheDocument();
    expect(within(overview).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'second');
    expect(screen.getByText('second@example.com')).toBeInTheDocument();
    expect(screen.queryByText('member@example.com')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search accounts' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter accounts by role' }),
      'admin',
    );
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.queryByText('second@example.com')).not.toBeInTheDocument();
  });

  it('prevents demoting the last administrator in the interface', async () => {
    vi.mocked(api.listUsers).mockResolvedValue([
      {
        id: 'admin-1',
        email: 'owner@example.com',
        role: 'admin',
        createdAt: '2026-08-12T00:00:00Z',
      },
    ]);

    render(<AdminUsersPage currentUserId="admin-1" />);

    const selector = await screen.findByRole('combobox', { name: 'Role for owner@example.com' });
    expect(within(selector).getByRole('option', { name: 'User' })).toBeDisabled();
    expect(screen.getByText('Protected: this is the last administrator.')).toBeInTheDocument();
  });

  it('keeps the current role and reports API failures', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateUserRole).mockRejectedValue(
      new Error('The last administrator cannot be demoted'),
    );
    vi.mocked(api.listUsers).mockResolvedValue([
      {
        id: 'admin-1',
        email: 'owner@example.com',
        role: 'admin',
        createdAt: '2026-08-12T00:00:00Z',
      },
      {
        id: 'admin-2',
        email: 'second-admin@example.com',
        role: 'admin',
        createdAt: '2026-08-13T00:00:00Z',
      },
    ]);

    render(<AdminUsersPage currentUserId="admin-1" />);
    const selector = await screen.findByRole('combobox', { name: 'Role for owner@example.com' });
    await user.selectOptions(selector, 'user');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The last administrator cannot be demoted',
    );
    await waitFor(() => expect(selector).toHaveValue('admin'));
  });
});
