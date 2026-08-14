export type UserRole = 'user' | 'admin';

export type StoryVisibility = 'private' | 'authenticated' | 'public' | 'invitation';
export type StoryEditPolicy = 'owner' | 'collaborators' | 'authenticated';
export type StoryCommentPolicy = 'disabled' | 'readers' | 'editors' | 'authenticated';
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
  role: StoryCollaboratorRole;
}

export interface StoryAccessConfiguration extends StoryAccessSettings {
  owner: { id: string; email: string };
  collaborators: StoryCollaborator[];
}

export const defaultStoryAccess: StoryAccessSettings = {
  visibility: 'private',
  editPolicy: 'owner',
  commentPolicy: 'disabled',
};

export function resolveStoryAccess(
  settings: StoryAccessSettings,
  subject: StoryAccessSubject,
): StoryAccessCapabilities {
  const privileged = subject.role === 'admin' || subject.isOwner === true;
  const canEditAsCollaborator =
    settings.visibility !== 'private' && subject.collaboratorRole === 'editor';
  const canEdit =
    privileged ||
    (subject.authenticated && (settings.editPolicy === 'authenticated' || canEditAsCollaborator));
  const canRead =
    privileged ||
    settings.visibility === 'public' ||
    (subject.authenticated &&
      (settings.visibility === 'authenticated' ||
        settings.editPolicy === 'authenticated' ||
        (settings.visibility === 'invitation' && subject.collaboratorRole !== undefined)));
  const canManage = privileged;
  const canComment =
    subject.authenticated &&
    canRead &&
    settings.commentPolicy !== 'disabled' &&
    (settings.commentPolicy === 'readers' ||
      (settings.commentPolicy === 'editors' && canEdit) ||
      (settings.commentPolicy === 'authenticated' && subject.authenticated));

  return { canRead, canEdit, canManage, canComment };
}
