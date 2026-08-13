import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '@paralleax/shared';
import { api, type ManagedUser } from '../api';
import './ProductPages.css';

type RoleFilter = 'all' | UserRole;

export function AdminUsersPage({ currentUserId }: { currentUserId?: string }) {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  const administratorCount = users.filter(({ role }) => role === 'admin').length;
  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return users.filter(
      (user) =>
        (roleFilter === 'all' || user.role === roleFilter) &&
        user.email.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [query, roleFilter, users]);

  async function changeRole(user: ManagedUser, role: UserRole) {
    if (role === user.role) return;
    try {
      setPendingId(user.id);
      setError('');
      setNotice('');
      const updated = await api.updateUserRole(user.id, role);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(
        t('admin.updated', {
          email: updated.email,
          role: t(updated.role === 'admin' ? 'admin.admin' : 'admin.user'),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('admin.updateFailed'));
    } finally {
      setPendingId('');
    }
  }

  return (
    <main className="product-page settings-page">
      <header className="settings-heading">
        <div>
          <span className="product-eyebrow">{t('admin.eyebrow')}</span>
          <h1>{t('admin.title')}</h1>
          <p>{t('admin.description')}</p>
        </div>
      </header>

      <section className="admin-overview" aria-label={t('admin.overview')}>
        <article>
          <strong>{users.length}</strong>
          <span>{t('admin.totalUsers', { count: users.length })}</span>
        </article>
        <article>
          <strong>{administratorCount}</strong>
          <span>{t('admin.totalAdmins', { count: administratorCount })}</span>
        </article>
        <article>
          <strong>{users.length - administratorCount}</strong>
          <span>{t('admin.totalMembers', { count: users.length - administratorCount })}</span>
        </article>
      </section>

      <section className="settings-card admin-rights-reference">
        <div>
          <span className="product-badge neutral">{t('admin.user')}</span>
          <p>{t('admin.userDescription')}</p>
        </div>
        <div>
          <span className="product-badge accent">{t('admin.admin')}</span>
          <p>{t('admin.adminDescription')}</p>
        </div>
      </section>

      <section className="admin-user-management" aria-labelledby="admin-user-list-title">
        <div className="admin-management-heading">
          <div>
            <h2 id="admin-user-list-title">{t('admin.accounts')}</h2>
            <p>{t('admin.accountsDescription')}</p>
          </div>
          <div className="admin-user-toolbar">
            <label className="library-search">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">{t('admin.search')}</span>
              <input
                aria-label={t('admin.search')}
                type="search"
                placeholder={t('admin.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="admin-role-filter">
              <span className="sr-only">{t('admin.filterRole')}</span>
              <select
                aria-label={t('admin.filterRole')}
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              >
                <option value="all">{t('admin.allRoles')}</option>
                <option value="user">{t('admin.usersOnly')}</option>
                <option value="admin">{t('admin.adminsOnly')}</option>
              </select>
            </label>
          </div>
        </div>

        {notice ? (
          <p className="admin-notice" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="library-error" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="settings-card admin-user-state" role="status">
            <span className="loading-ring" aria-hidden="true" />
            <p>{t('admin.loading')}</p>
          </div>
        ) : visibleUsers.length ? (
          <div className="settings-card admin-user-list">
            {visibleUsers.map((user) => {
              const isLastAdministrator = user.role === 'admin' && administratorCount === 1;
              return (
                <div key={user.id}>
                  <span className="admin-user-avatar" aria-hidden="true">
                    {user.email.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="admin-user-identity">
                    <span className="admin-user-name">
                      <b>{user.email}</b>
                      {user.id === currentUserId ? (
                        <small className="product-badge neutral">{t('admin.you')}</small>
                      ) : null}
                    </span>
                    <small>
                      {t('admin.joined', {
                        date: new Intl.DateTimeFormat(
                          i18n.resolvedLanguage ?? i18n.language,
                        ).format(new Date(user.createdAt)),
                      })}
                    </small>
                    {isLastAdministrator ? (
                      <small className="admin-protected-role">{t('admin.lastAdmin')}</small>
                    ) : null}
                  </span>
                  <label className="admin-role-control">
                    <span>{t('admin.role')}</span>
                    <select
                      aria-label={t('admin.roleFor', { email: user.email })}
                      value={user.role}
                      disabled={pendingId === user.id}
                      onChange={(event) => void changeRole(user, event.target.value as UserRole)}
                    >
                      <option value="user" disabled={isLastAdministrator}>
                        {t('admin.user')}
                      </option>
                      <option value="admin">{t('admin.admin')}</option>
                    </select>
                    {pendingId === user.id ? <small>{t('admin.saving')}</small> : null}
                  </label>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="settings-card admin-user-state">
            <p>{t(users.length ? 'admin.noResults' : 'admin.noUsers')}</p>
          </div>
        )}
      </section>
    </main>
  );
}
