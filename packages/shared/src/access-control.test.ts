import { describe, expect, it } from 'vitest';
import { defaultStoryAccess, resolveStoryAccess, type StoryAccessSettings } from './index.js';

const invitation: StoryAccessSettings = {
  visibility: 'invitation',
  editPolicy: 'collaborators',
  commentPolicy: 'readers',
};

describe('story access control', () => {
  it('denies private stories by default and permits their owner or an administrator', () => {
    expect(resolveStoryAccess(defaultStoryAccess, { authenticated: false })).toEqual({
      canRead: false,
      canEdit: false,
      canManage: false,
      canComment: false,
    });
    expect(
      resolveStoryAccess(defaultStoryAccess, { authenticated: true, isOwner: true, role: 'user' }),
    ).toMatchObject({ canRead: true, canEdit: true, canManage: true });
    expect(
      resolveStoryAccess(defaultStoryAccess, { authenticated: true, role: 'admin' }),
    ).toMatchObject({ canRead: true, canEdit: true, canManage: true });
  });

  it('never grants anonymous comment authorship even on a public story', () => {
    expect(
      resolveStoryAccess(
        { visibility: 'public', editPolicy: 'owner', commentPolicy: 'readers' },
        { authenticated: false },
      ),
    ).toMatchObject({ canRead: true, canComment: false });
  });

  it('distinguishes invited viewers and editors', () => {
    expect(
      resolveStoryAccess(invitation, {
        authenticated: true,
        role: 'user',
        collaboratorRole: 'viewer',
      }),
    ).toEqual({ canRead: true, canEdit: false, canManage: false, canComment: true });
    expect(
      resolveStoryAccess(invitation, {
        authenticated: true,
        role: 'user',
        collaboratorRole: 'editor',
      }),
    ).toEqual({ canRead: true, canEdit: true, canManage: false, canComment: true });
  });

  it('supports public reading and authenticated editing without granting management', () => {
    const settings: StoryAccessSettings = {
      visibility: 'public',
      editPolicy: 'authenticated',
      commentPolicy: 'authenticated',
    };
    expect(resolveStoryAccess(settings, { authenticated: false })).toEqual({
      canRead: true,
      canEdit: false,
      canManage: false,
      canComment: false,
    });
    expect(resolveStoryAccess(settings, { authenticated: true, role: 'user' })).toEqual({
      canRead: true,
      canEdit: true,
      canManage: false,
      canComment: true,
    });
  });

  it('does not let stale invitations bypass private visibility', () => {
    expect(
      resolveStoryAccess(defaultStoryAccess, {
        authenticated: true,
        role: 'user',
        collaboratorRole: 'editor',
      }),
    ).toEqual({ canRead: false, canEdit: false, canManage: false, canComment: false });
  });
});
