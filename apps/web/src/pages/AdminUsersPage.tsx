import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '@paralleax/shared';
import { api, type ManagedUser } from '../api';
import './ProductPages.css';

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState('');

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((caught: Error) => setError(caught.message));
  }, []);

  async function changeRole(user: ManagedUser, role: UserRole) {
    try {
      setPendingId(user.id);
      setError('');
      const updated = await api.updateUserRole(user.id, role);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('admin.updateFailed'));
    } finally {
      setPendingId('');
    }
  }

  return (
    <main className="product-page settings-page">
      <span className="product-eyebrow">{t('admin.eyebrow')}</span>
      <h1>{t('admin.title')}</h1>
      <p>{t('admin.description')}</p>
      {error ? (
        <p className="library-error" role="alert">
          {error}
        </p>
      ) : null}
      <section className="settings-card admin-user-list">
        {users.map((user) => (
          <div key={user.id}>
            <span>
              <b>{user.email}</b>
              <small>
                {t('admin.joined', { date: new Date(user.createdAt).toLocaleDateString() })}
              </small>
            </span>
            <label>
              <span className="sr-only">{t('admin.roleFor', { email: user.email })}</span>
              <select
                value={user.role}
                disabled={pendingId === user.id}
                onChange={(event) => void changeRole(user, event.target.value as UserRole)}
              >
                <option value="user">{t('admin.user')}</option>
                <option value="admin">{t('admin.admin')}</option>
              </select>
            </label>
          </div>
        ))}
      </section>
    </main>
  );
}
