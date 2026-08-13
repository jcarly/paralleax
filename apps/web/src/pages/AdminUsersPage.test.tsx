import { cleanup, render, screen } from '@testing-library/react';
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
  });
});
