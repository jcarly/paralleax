import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { StoryAccessConfiguration, StoryCollaboratorRole } from '@paralleax/shared';
import { api } from '../api';
import './ProductPages.css';

export function StoryAccessPage() {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const [access, setAccess] = useState<StoryAccessConfiguration>();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StoryCollaboratorRole>('viewer');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getStoryAccess(storyId)
      .then(setAccess)
      .catch((caught: Error) => setError(caught.message));
  }, [storyId]);

  async function save() {
    if (!access || pending) return;
    try {
      setPending(true);
      setError('');
      setAccess(await api.updateStoryAccess(storyId, access));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('access.saveFailed'));
    } finally {
      setPending(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || pending) return;
    try {
      setPending(true);
      setError('');
      setAccess(await api.setStoryCollaborator(storyId, email.trim(), role));
      setEmail('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('access.inviteFailed'));
    } finally {
      setPending(false);
    }
  }

  async function remove(userId: string) {
    if (!access || pending) return;
    try {
      setPending(true);
      setError('');
      await api.removeStoryCollaborator(storyId, userId);
      setAccess({
        ...access,
        collaborators: access.collaborators.filter((item) => item.userId !== userId),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('access.removeFailed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="product-page settings-page">
      <div className="settings-heading">
        <div>
          <span className="product-eyebrow">{t('access.eyebrow')}</span>
          <h1>{t('access.title')}</h1>
          <p>{t('access.description')}</p>
        </div>
        <Link className="product-secondary" to={`/stories/${storyId}/edit`}>
          {t('access.back')}
        </Link>
      </div>
      {error ? (
        <p className="library-error" role="alert">
          {error}
        </p>
      ) : null}
      {!access ? (
        <p>{t('access.loading')}</p>
      ) : (
        <div className="settings-grid">
          <section className="settings-card">
            <h2>{t('access.general')}</h2>
            <p>{t('access.owner', { email: access.owner.email })}</p>
            <label className="product-field">
              <span>{t('access.visibility.label')}</span>
              <select
                value={access.visibility}
                onChange={(event) =>
                  setAccess({
                    ...access,
                    visibility: event.target.value as StoryAccessConfiguration['visibility'],
                  })
                }
              >
                {(['private', 'authenticated', 'public', 'invitation'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`access.visibility.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="product-field">
              <span>{t('access.edit.label')}</span>
              <select
                value={access.editPolicy}
                onChange={(event) =>
                  setAccess({
                    ...access,
                    editPolicy: event.target.value as StoryAccessConfiguration['editPolicy'],
                  })
                }
              >
                {(['owner', 'collaborators', 'authenticated'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`access.edit.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="product-field">
              <span>{t('access.comments.label')}</span>
              <select
                value={access.commentPolicy}
                onChange={(event) =>
                  setAccess({
                    ...access,
                    commentPolicy: event.target.value as StoryAccessConfiguration['commentPolicy'],
                  })
                }
              >
                {(['editors', 'readers'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`access.comments.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="product-help">{t('access.comments.help')}</p>
            <button className="product-primary" disabled={pending} onClick={() => void save()}>
              {t(pending ? 'access.saving' : 'access.save')}
            </button>
          </section>
          <section className="settings-card">
            <h2>{t('access.collaborators')}</h2>
            <p>{t('access.collaboratorsHelp')}</p>
            <form className="collaborator-form" onSubmit={(event) => void invite(event)}>
              <label className="product-field">
                <span>{t('access.email')}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="product-field">
                <span>{t('access.role.label')}</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as StoryCollaboratorRole)}
                >
                  <option value="viewer">{t('access.role.viewer')}</option>
                  <option value="editor">{t('access.role.editor')}</option>
                </select>
              </label>
              <button className="product-secondary" disabled={pending || !email.trim()}>
                {t('access.add')}
              </button>
            </form>
            <ul className="access-list">
              {access.collaborators.map((collaborator) => (
                <li key={collaborator.userId}>
                  <span>
                    <b>{collaborator.email}</b>
                    <small>{t(`access.role.${collaborator.role}`)}</small>
                  </span>
                  <button
                    className="product-ghost danger-text compact"
                    disabled={pending}
                    onClick={() => void remove(collaborator.userId)}
                  >
                    {t('access.remove')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
