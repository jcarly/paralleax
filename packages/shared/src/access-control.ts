import { DomainValidationError } from './domain-errors.js';
import type { UserDisplayIdentity } from './user-identity.js';

export type UserRole = 'user' | 'admin';

export type StoryVisibility = 'private' | 'authenticated' | 'public' | 'unlisted' | 'invitation';
export type StoryEditPolicy = 'owner' | 'collaborators' | 'authenticated';
export type StoryCommentPolicy = 'readers' | 'editors';
export type StoryCollaboratorRole = 'viewer' | 'editor';

export interface StoryAccessSettings {
  visibility: StoryVisibility;
  editPolicy: StoryEditPolicy;
  commentPolicy: StoryCommentPolicy;
}

export interface StoryAccessSubject {
  authenticated: boolean;
  role?: UserRole;
  isOwner?: boolean;
  collaboratorRole?: StoryCollaboratorRole;
}

export interface StoryAccessCapabilities {
  canRead: boolean;
  canEdit: boolean;
  canManage: boolean;
  canComment: boolean;
}

export interface StoryCollaborator {
  userId: string;
  email: string;
  displayName: string;
  role: StoryCollaboratorRole;
}

export interface StoryAccessConfiguration extends StoryAccessSettings {
  owner: UserDisplayIdentity & { email: string };
  collaborators: StoryCollaborator[];
}

export const defaultStoryAccess: StoryAccessSettings = {
  visibility: 'private',
  editPolicy: 'owner',
  commentPolicy: 'editors',
};

export function resolveStoryAccess(
  settings: StoryAccessSettings,
  subject: StoryAccessSubject,
): StoryAccessCapabilities {
  const privileged = subject.role === 'admin' || subject.isOwner === true;
  // An editor grant edits only when the edit policy is open to editors and the
  // story is not private: "Owner only" editing means the owner only.
  const canEditAsCollaborator =
    settings.visibility !== 'private' &&
    settings.editPolicy !== 'owner' &&
    subject.collaboratorRole === 'editor';
  const canEdit =
    privileged ||
    (subject.authenticated && (settings.editPolicy === 'authenticated' || canEditAsCollaborator));
  const canRead =
    privileged ||
    settings.visibility === 'public' ||
    settings.visibility === 'unlisted' ||
    (subject.authenticated &&
      (settings.visibility === 'authenticated' ||
        settings.editPolicy === 'authenticated' ||
        (settings.visibility === 'invitation' && subject.collaboratorRole !== undefined)));
  const canManage = privileged;
  const canComment =
    subject.authenticated &&
    canRead &&
    (settings.commentPolicy === 'readers' || (settings.commentPolicy === 'editors' && canEdit));

  return { canRead, canEdit, canManage, canComment };
}

export function canDiscoverStory(
  settings: StoryAccessSettings,
  subject: StoryAccessSubject,
): boolean {
  if (settings.visibility === 'unlisted') {
    return (
      subject.role === 'admin' ||
      subject.isOwner === true ||
      (subject.authenticated && subject.collaboratorRole !== undefined)
    );
  }
  return resolveStoryAccess(settings, subject).canRead;
}

/** Editing policies from narrowest to broadest audience. */
export const storyEditPoliciesByBreadth: readonly StoryEditPolicy[] = [
  'owner',
  'collaborators',
  'authenticated',
];

/**
 * Who can edit a Story must be part of who can read it: an owner-only Story can
 * only be edited by its owner, and an invitation-only Story only by invited
 * editors. Other reading policies allow every editing policy.
 */
export function getAllowedStoryEditPolicies(
  visibility: StoryVisibility,
): readonly StoryEditPolicy[] {
  if (visibility === 'private') {
    return ['owner'];
  }
  if (visibility === 'invitation') {
    return ['owner', 'collaborators'];
  }
  return storyEditPoliciesByBreadth;
}

export function isStoryAccessCoherent(
  settings: Pick<StoryAccessSettings, 'visibility' | 'editPolicy'>,
): boolean {
  return getAllowedStoryEditPolicies(settings.visibility).includes(settings.editPolicy);
}

/** Keeps the editing policy, or narrows it to the broadest one the reading policy allows. */
export function fitStoryEditPolicy(
  visibility: StoryVisibility,
  editPolicy: StoryEditPolicy,
): StoryEditPolicy {
  const allowed = getAllowedStoryEditPolicies(visibility);
  return allowed.includes(editPolicy) ? editPolicy : allowed[allowed.length - 1];
}

export function assertStoryAccessCoherent(settings: StoryAccessSettings): void {
  if (!isStoryAccessCoherent(settings)) {
    throw new DomainValidationError(
      'STORY_ACCESS_INCOHERENT',
      'Editing must not be open to more people than reading.',
      {
        visibility: settings.visibility,
        editPolicy: settings.editPolicy,
        allowedEditPolicies: getAllowedStoryEditPolicies(settings.visibility),
      },
    );
  }
}
