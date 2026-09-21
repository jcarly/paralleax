import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  StoryAccessConfiguration,
  StoryAccessSettings,
  StoryCollaboratorRole,
} from '@paralleax/shared';
import { api } from '../../api';

interface StoryAccessSettingsProps {
  storyId: string;
  onInaccessible?: (error: unknown) => boolean;
}

const visibilityOptions = ['public', 'authenticated', 'invitation', 'private'] as const;
const editOptions = ['authenticated', 'collaborators', 'owner'] as const;
const commentOptions = ['readers', 'editors'] as const;

export function StoryAccessSettings({ storyId, onInaccessible }: StoryAccessSettingsProps) {
  const { t } = useTranslation();
  const [access, setAccess] = useState<StoryAccessConfiguration>();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StoryCollaboratorRole>('viewer');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getStoryAccess(storyId)
      .then((loadedAccess) => {
        if (!cancelled) setAccess(loadedAccess);
      })
      .catch((caught: unknown) => {
        if (cancelled || onInaccessible?.(caught)) return;
        setError(caught instanceof Error ? caught.message : t('access.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [onInaccessible, storyId, t]);

  function updateAccessSetting<Key extends keyof StoryAccessSettings>(
    key: Key,
    value: StoryAccessSettings[Key],
  ) {
    setAccess((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!access || pending) return;
    await runAccessOperation(() => api.updateStoryAccess(storyId, access), t('access.saveFailed'));
  }

  async function addUser(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || pending) return;
    const updated = await runAccessOperation(
      () => api.setStoryCollaborator(storyId, email.trim(), role),
      t('access.inviteFailed'),
    );
    if (updated) setEmail('');
  }

  async function changeRole(emailAddress: string, nextRole: StoryCollaboratorRole) {
    if (pending) return;
    await runAccessOperation(
      () => api.setStoryCollaborator(storyId, emailAddress, nextRole),
      t('access.roleUpdateFailed'),
    );
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
      if (onInaccessible?.(caught)) return;
      setError(caught instanceof Error ? caught.message : t('access.removeFailed'));
    } finally {
      setPending(false);
    }
  }

  async function runAccessOperation(
    operation: () => Promise<StoryAccessConfiguration>,
    fallbackError: string,
  ) {
    try {
      setPending(true);
      setError('');
      const updated = await operation();
      setAccess(updated);
      return updated;
    } catch (caught) {
      if (!onInaccessible?.(caught)) {
        setError(caught instanceof Error ? caught.message : fallbackError);
      }
      return undefined;
    } finally {
      setPending(false);
    }
  }

  if (error && !access) {
    return (
      <p className="library-error" role="alert">
        {error}
      </p>
    );
  }
  if (!access) return <p>{t('access.loading')}</p>;

  return (
    <div className="settings-grid story-access-settings">
      <section className="settings-card">
        <h3>{t('access.general')}</h3>
        <p>
          {t('access.owner', {
            email: `${access.owner.displayName} · ${access.owner.email}`,
          })}
        </p>
        <label className="product-field">
          <span>{t('access.visibility.label')}</span>
          <select
            value={access.visibility}
            disabled={pending}
            onChange={(event) =>
              updateAccessSetting(
                'visibility',
                event.currentTarget.value as StoryAccessConfiguration['visibility'],
              )
            }
          >
            {visibilityOptions.map((value) => (
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
            disabled={pending}
            onChange={(event) =>
              updateAccessSetting(
                'editPolicy',
                event.currentTarget.value as StoryAccessConfiguration['editPolicy'],
              )
            }
          >
            {editOptions.map((value) => (
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
            disabled={pending}
            onChange={(event) =>
              updateAccessSetting(
                'commentPolicy',
                event.currentTarget.value as StoryAccessConfiguration['commentPolicy'],
              )
            }
          >
            {commentOptions.map((value) => (
              <option key={value} value={value}>
                {t(`access.comments.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="product-help">{t('access.comments.help')}</p>
        <div className="settings-card-actions">
          <button className="product-primary" disabled={pending} onClick={() => void save()}>
            {t(pending ? 'access.saving' : 'access.save')}
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h3>{t('access.collaborators')}</h3>
        <p>{t('access.collaboratorsHelp')}</p>
        <form className="collaborator-form" onSubmit={(event) => void addUser(event)}>
          <label className="product-field">
            <span>{t('access.email')}</span>
            <input
              type="email"
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="product-field">
            <span>{t('access.role.label')}</span>
            <select
              value={role}
              disabled={pending}
              onChange={(event) => setRole(event.target.value as StoryCollaboratorRole)}
            >
              <option value="viewer">{t('access.role.viewer')}</option>
              <option value="editor">{t('access.role.editor')}</option>
            </select>
          </label>
          <button className="product-primary" disabled={pending || !email.trim()}>
            {t('access.add')}
          </button>
        </form>
        <ul className="access-list">
          {access.collaborators.map((collaborator) => (
            <li key={collaborator.userId}>
              <span className="access-collaborator-identity">
                <b>{collaborator.displayName}</b>
                <span>{collaborator.email}</span>
              </span>
              <label className="access-collaborator-role">
                <span>{t('access.roleFor', { name: collaborator.displayName })}</span>
                <select
                  value={collaborator.role}
                  disabled={pending}
                  onChange={(event) =>
                    void changeRole(
                      collaborator.email,
                      event.currentTarget.value as StoryCollaboratorRole,
                    )
                  }
                >
                  <option value="viewer">{t('access.role.viewer')}</option>
                  <option value="editor">{t('access.role.editor')}</option>
                </select>
              </label>
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
        {error ? (
          <p className="library-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
