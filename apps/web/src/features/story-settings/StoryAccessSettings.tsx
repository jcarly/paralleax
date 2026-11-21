import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  StoryAccessConfiguration,
  StoryAccessSettings,
  StoryCollaboratorRole,
} from '@paralleax/shared';
import { api } from '../../api';
import { apiErrorMessage } from '../../apiErrorMessages';
import { FieldHelpTooltip } from '../../components/FieldHelpTooltip';
import { CollaboratorInviteForm } from './CollaboratorInviteForm';

interface StoryAccessSettingsProps {
  storyId: string;
  onInaccessible?: (error: unknown) => boolean;
}

const visibilityOptions = ['public', 'unlisted', 'authenticated', 'invitation', 'private'] as const;
const editOptions = ['authenticated', 'collaborators', 'owner'] as const;
const commentOptions = ['readers', 'editors'] as const;

export function StoryAccessSettings({ storyId, onInaccessible }: StoryAccessSettingsProps) {
  const { t } = useTranslation();
  const [access, setAccess] = useState<StoryAccessConfiguration>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [accessStatus, setAccessStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    api
      .getStoryAccess(storyId)
      .then((loadedAccess) => {
        if (!cancelled) {
          setAccess(loadedAccess);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled || onInaccessible?.(caught)) {
          return;
        }
        setError(apiErrorMessage(caught, t, t('access.loadFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, [onInaccessible, storyId, t]);

  async function updateAccessSetting<Key extends keyof StoryAccessSettings>(
    key: Key,
    value: StoryAccessSettings[Key],
  ) {
    if (!access || pending) {
      return;
    }
    const previous = access;
    const next = { ...access, [key]: value };
    setAccess(next);
    setAccessStatus('saving');
    const updated = await runAccessOperation(
      () => api.updateStoryAccess(storyId, next),
      t('access.saveFailed'),
    );
    if (updated) {
      setAccessStatus('saved');
    } else {
      setAccess(previous);
      setAccessStatus('error');
    }
  }

  async function addUser(email: string, role: StoryCollaboratorRole): Promise<boolean> {
    const updated = await runAccessOperation(
      () => api.setStoryCollaborator(storyId, email.trim(), role),
      t('access.inviteFailed'),
    );
    return Boolean(updated);
  }

  async function changeRole(emailAddress: string, nextRole: StoryCollaboratorRole) {
    if (pending) {
      return;
    }
    await runAccessOperation(
      () => api.setStoryCollaborator(storyId, emailAddress, nextRole),
      t('access.roleUpdateFailed'),
    );
  }

  async function remove(userId: string) {
    if (!access || pending) {
      return;
    }
    try {
      setPending(true);
      setError('');
      await api.removeStoryCollaborator(storyId, userId);
      setAccess({
        ...access,
        collaborators: access.collaborators.filter((item) => item.userId !== userId),
      });
    } catch (caught) {
      if (onInaccessible?.(caught)) {
        return;
      }
      setError(apiErrorMessage(caught, t, t('access.removeFailed')));
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
        setError(apiErrorMessage(caught, t, fallbackError));
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
  if (!access) {
    return <p>{t('access.loading')}</p>;
  }

  return (
    <div className="settings-grid story-access-settings">
      <section className="settings-card">
        <h3>{t('access.general')}</h3>
        <p>
          {t('access.owner', {
            email: `${access.owner.displayName} · ${access.owner.email}`,
          })}
        </p>
        <AccessPolicyField
          id="story-access-visibility"
          policy="visibility"
          options={visibilityOptions}
          value={access.visibility}
          disabled={pending}
          note={
            access.editPolicy === 'authenticated' &&
            (access.visibility === 'private' || access.visibility === 'invitation')
              ? t('access.visibility.widenedByEditing')
              : undefined
          }
          onChange={(value) => void updateAccessSetting('visibility', value)}
        />
        <AccessPolicyField
          id="story-access-edit"
          policy="edit"
          options={editOptions}
          value={access.editPolicy}
          disabled={pending}
          onChange={(value) => void updateAccessSetting('editPolicy', value)}
        />
        <AccessPolicyField
          id="story-access-comments"
          policy="comments"
          options={commentOptions}
          value={access.commentPolicy}
          disabled={pending}
          onChange={(value) => void updateAccessSetting('commentPolicy', value)}
        />
        {accessStatus === 'saving' ? (
          <p className="product-help" role="status">
            {t('access.saving')}
          </p>
        ) : null}
        {accessStatus === 'saved' ? (
          <p className="form-success" role="status">
            {t('access.saved')}
          </p>
        ) : null}
      </section>
      <section className="settings-card">
        <div className="field-heading-with-help">
          <h3>{t('access.collaborators')}</h3>
          <FieldHelpTooltip
            label={t('access.collaborators')}
            help={t('access.collaboratorsHelp')}
          />
        </div>
        <CollaboratorInviteForm
          collaborators={access.collaborators}
          pending={pending}
          onInvite={addUser}
        />
        <ul className="access-list">
          {access.collaborators.map((collaborator) => (
            <li key={collaborator.userId}>
              <span className="access-collaborator-identity">
                <b>{collaborator.displayName}</b>
                <span>{collaborator.email}</span>
              </span>
              <label className="access-collaborator-role form-field form-field--compact">
                <span>{t('access.roleFor', { name: collaborator.displayName })}</span>
                <select
                  className="form-control form-control--compact"
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

function AccessPolicyField<Value extends string>({
  id,
  policy,
  options,
  value,
  disabled,
  note,
  onChange,
}: {
  id: string;
  policy: 'visibility' | 'edit' | 'comments';
  options: readonly Value[];
  value: Value;
  disabled: boolean;
  note?: string;
  onChange: (value: Value) => void;
}) {
  const { t } = useTranslation();
  const label = t(`access.${policy}.label`);
  return (
    <div className="form-field form-field--standard">
      <div className="field-label-with-help">
        <label htmlFor={id}>{label}</label>
        <FieldHelpTooltip label={label} help={t(`access.${policy}.help.${value}`)} />
      </div>
      <select
        className="form-control form-control--standard"
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.value as Value);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`access.${policy}.${option}`)}
          </option>
        ))}
      </select>
      {note === undefined ? null : <p className="product-help">{note}</p>}
    </div>
  );
}
