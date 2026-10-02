import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidUserDisplayName, normalizeUserDisplayName } from '@paralleax/shared';
import { api, type AuthUser } from '../api';
import { apiErrorMessage } from '../apiErrorMessages';
import { handleModalDialogKeyDown } from './modalDialogKeyboard';

export function AccountDialog({
  user,
  onClose,
  onUpdated,
}: {
  user: AuthUser;
  onClose: () => void;
  onUpdated: (user: AuthUser) => void;
}) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityPending, setSecurityPending] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');
  const normalized = normalizeUserDisplayName(displayName);
  const valid = isValidUserDisplayName(normalized);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    try {
      setPending(true);
      setError('');
      onUpdated(await api.updateCurrentUser(normalized));
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught, t, t('account.updateFailed')));
    } finally {
      setPending(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (currentPassword.length < 1 || newPassword.length < 8 || securityPending) return;
    try {
      setSecurityPending(true);
      setSecurityError('');
      setSecurityNotice('');
      onUpdated(await api.changePassword(currentPassword, newPassword));
      setCurrentPassword('');
      setNewPassword('');
      setSecurityNotice(t('account.passwordChanged'));
    } catch (caught) {
      setSecurityError(apiErrorMessage(caught, t, t('account.securityUpdateFailed')));
    } finally {
      setSecurityPending(false);
    }
  }

  async function revokeOtherSessions() {
    if (securityPending) return;
    try {
      setSecurityPending(true);
      setSecurityError('');
      setSecurityNotice('');
      await api.revokeOtherSessions();
      setSecurityNotice(t('account.otherSessionsRevoked'));
    } catch (caught) {
      setSecurityError(apiErrorMessage(caught, t, t('account.securityUpdateFailed')));
    } finally {
      setSecurityPending(false);
    }
  }

  return (
    <div className="modal-backdrop product-page" role="presentation">
      <section
        className="new-story-dialog account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        onKeyDown={(event) => handleModalDialogKeyDown(event, onClose)}
      >
        <div className="dialog-icon" aria-hidden="true">
          â—‡
        </div>
        <span className="product-eyebrow">{t('account.eyebrow')}</span>
        <h2 id="account-dialog-title">{t('account.title')}</h2>
        <p>{t('account.description')}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="product-field">
            <span>{t('account.displayName')}</span>
            <input
              autoFocus
              aria-label={t('account.displayName')}
              autoComplete="nickname"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={50}
              required
            />
            <small>{t('account.displayNameHelp')}</small>
          </label>
          <div className="account-email">
            <span>{t('account.email')}</span>
            <b>{user.email}</b>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="product-secondary"
              type="button"
              onClick={onClose}
              disabled={pending}
            >
              {t('account.cancel')}
            </button>
            <button className="product-primary" type="submit" disabled={!valid || pending}>
              {pending ? t('account.saving') : t('account.save')}
            </button>
          </div>
        </form>
        <section className="account-security" aria-labelledby="account-security-title">
          <h3 id="account-security-title">{t('account.securityTitle')}</h3>
          <p>{t('account.securityDescription')}</p>
          <form onSubmit={(event) => void changePassword(event)}>
            <label className="product-field">
              <span>{t('account.currentPassword')}</span>
              <input
                autoComplete="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <label className="product-field">
              <span>{t('account.newPassword')}</span>
              <input
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <div className="account-security-actions">
              <button
                className="product-secondary"
                type="submit"
                disabled={securityPending || currentPassword.length < 1 || newPassword.length < 8}
              >
                {securityPending ? t('account.changingPassword') : t('account.changePassword')}
              </button>
              <button
                className="product-secondary"
                type="button"
                disabled={securityPending}
                onClick={() => void revokeOtherSessions()}
              >
                {securityPending
                  ? t('account.revokingOtherSessions')
                  : t('account.revokeOtherSessions')}
              </button>
            </div>
          </form>
          {securityError ? (
            <p className="form-error" role="alert">
              {securityError}
            </p>
          ) : null}
          {securityNotice ? (
            <p className="auth-notice" role="status">
              {securityNotice}
            </p>
          ) : null}
        </section>
      </section>
    </div>
  );
}
