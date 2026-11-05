import {
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryAccessConfiguration, StoryCollaboratorRole } from '@paralleax/shared';

type Collaborator = StoryAccessConfiguration['collaborators'][number];

export function CollaboratorInviteForm({
  collaborators,
  pending,
  onInvite,
}: {
  collaborators: StoryAccessConfiguration['collaborators'];
  pending: boolean;
  onInvite: (email: string, role: StoryCollaboratorRole) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [emailValid, setEmailValid] = useState(false);
  const [role, setRole] = useState<StoryCollaboratorRole>('viewer');
  const validation = validateInviteEmail(email, emailValid, collaborators, {
    duplicate: t('access.userAlreadyAdded'),
    invalid: t('access.emailInvalid'),
  });
  const canSubmit = Boolean(email.trim()) && emailValid && !validation.duplicate && !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    if (await onInvite(email.trim(), role)) {
      setEmail('');
      setEmailValid(false);
    }
  }

  return (
    <CollaboratorInviteFormView
      email={email}
      emailError={validation.error}
      role={role}
      pending={pending}
      canSubmit={canSubmit}
      onEmailChange={createEmailChangeHandler(setEmail, setEmailValid)}
      onRoleChange={createRoleChangeHandler(setRole)}
      onSubmit={(event) => void submit(event)}
    />
  );
}

function CollaboratorInviteFormView({
  email,
  emailError,
  role,
  pending,
  canSubmit,
  onEmailChange,
  onRoleChange,
  onSubmit,
}: {
  email: string;
  emailError: string;
  role: StoryCollaboratorRole;
  pending: boolean;
  canSubmit: boolean;
  onEmailChange: (email: string, isValid: boolean) => void;
  onRoleChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { t } = useTranslation();

  return (
    <form className="collaborator-form" onSubmit={(event) => void onSubmit(event)}>
      <CollaboratorEmailField
        email={email}
        emailError={emailError}
        pending={pending}
        onChange={onEmailChange}
      />
      <label className="form-field form-field--standard">
        <span>{t('access.role.label')}</span>
        <select
          className="form-control form-control--standard"
          value={role}
          disabled={pending}
          onChange={onRoleChange}
        >
          <option value="viewer">{t('access.role.viewer')}</option>
          <option value="editor">{t('access.role.editor')}</option>
        </select>
      </label>
      <button className="product-primary" disabled={!canSubmit}>
        {pending ? t('access.adding') : t('access.add')}
      </button>
    </form>
  );
}

function validateInviteEmail(
  email: string,
  emailValid: boolean,
  collaborators: Collaborator[],
  messages: { duplicate: string; invalid: string },
): { duplicate: boolean; error: string } {
  const duplicate = collaborators.some(
    (collaborator) => normalizeEmail(collaborator.email) === normalizeEmail(email),
  );
  return {
    duplicate,
    error: duplicate ? messages.duplicate : email && !emailValid ? messages.invalid : '',
  };
}

function createEmailChangeHandler(
  setEmail: Dispatch<SetStateAction<string>>,
  setEmailValid: Dispatch<SetStateAction<boolean>>,
) {
  return (value: string, isValid: boolean) => {
    setEmail(value);
    setEmailValid(isValid);
  };
}

function createRoleChangeHandler(setRole: Dispatch<SetStateAction<StoryCollaboratorRole>>) {
  return (event: ChangeEvent<HTMLSelectElement>) => {
    const nextRole = event.currentTarget.value;
    if (isCollaboratorRole(nextRole)) {
      setRole(nextRole);
    }
  };
}

function CollaboratorEmailField({
  email,
  emailError,
  pending,
  onChange,
}: {
  email: string;
  emailError: string;
  pending: boolean;
  onChange: (email: string, isValid: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <label className={`form-field form-field--standard ${emailError ? 'form-field--error' : ''}`}>
      <span>{t('access.email')}</span>
      <input
        className="form-control form-control--standard"
        autoComplete="email"
        required
        type="email"
        value={email}
        disabled={pending}
        aria-invalid={emailError ? true : undefined}
        aria-describedby={emailError ? 'collaborator-email-error' : undefined}
        onChange={(event) => onChange(event.target.value, event.currentTarget.validity.valid)}
      />
      {emailError ? (
        <small className="form-field-error" id="collaborator-email-error">
          {emailError}
        </small>
      ) : null}
    </label>
  );
}

function isCollaboratorRole(value: string): value is StoryCollaboratorRole {
  return value === 'viewer' || value === 'editor';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
