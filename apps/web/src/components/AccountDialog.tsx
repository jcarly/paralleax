import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidUserDisplayName, normalizeUserDisplayName } from '@paralleax/shared';
import { api, type AuthUser } from '../api';
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
      setError(caught instanceof Error ? caught.message : t('account.updateFailed'));
    } finally {
      setPending(false);
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
      </section>
    </div>
  );
}
